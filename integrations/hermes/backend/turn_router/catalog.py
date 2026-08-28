from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_TARGET_ID_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")
_COST_RANK = {"free": 0, "low": 1, "standard": 2, "premium": 3}
_MODEL_TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}\Z")
_REASONING_LEVELS = {"none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"}


class CatalogError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _strict_bool(data: dict[str, Any], key: str, default: bool) -> bool:
    if key not in data:
        return default
    value = data[key]
    if type(value) is not bool:
        raise CatalogError("catalog_invalid", f"{key} must be a boolean")
    return value


def _strict_optional_rank(data: dict[str, Any]) -> int | None:
    if "quality_rank" not in data:
        return None
    value = data["quality_rank"]
    if type(value) is not int or value < 0 or value > 1_000_000:
        raise CatalogError("catalog_invalid", "quality_rank must be an integer between 0 and 1000000")
    return value


@dataclass(frozen=True)
class TargetSpec:
    id: str
    label: str
    provider: str
    model: str
    quality_rank: int | None
    reasoning_effort: str | None
    cost_class: str
    enabled: bool
    requires_approval: bool

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            **({"quality_rank": self.quality_rank} if self.quality_rank is not None else {}),
            "cost_class": self.cost_class,
            "enabled": self.enabled,
            "requires_approval": self.requires_approval,
        }

    def override_dict(self) -> dict[str, str]:
        result = {"target_id": self.id, "provider": self.provider, "model": self.model}
        if self.reasoning_effort:
            result["reasoning_effort"] = self.reasoning_effort
        return result


class ApprovalTokenManager:
    """Short-lived HMAC approval tokens bound to one logical turn and target."""

    def __init__(self, secret: bytes, *, now=time.time):
        if len(secret) < 32:
            raise ValueError("approval secret must contain at least 32 bytes")
        self._secret = secret
        self._now = now

    @staticmethod
    def _payload(profile: str, lineage: str, turn_id: str, target_id: str, expires_at: int) -> bytes:
        return "".join((profile, lineage, turn_id, target_id, str(expires_at))).encode("utf-8")

    def issue(self, *, profile: str, lineage: str, turn_id: str, target_id: str, ttl_seconds: int = 120) -> str:
        if ttl_seconds <= 0 or ttl_seconds > 600:
            raise ValueError("approval ttl must be between 1 and 600 seconds")
        expires_at = int(self._now()) + ttl_seconds
        payload = self._payload(profile, lineage, turn_id, target_id, expires_at)
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        payload_encoded = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
        signature_encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
        return f"v1.{payload_encoded}.{signature_encoded}"

    def verify(self, token: str | None, *, profile: str, lineage: str, turn_id: str, target_id: str) -> bool:
        if not token:
            return False
        try:
            version, payload_encoded, signature_encoded = token.split(".", 2)
            if version != "v1":
                return False
            payload = base64.urlsafe_b64decode(payload_encoded + "=" * (-len(payload_encoded) % 4))
            signature = base64.urlsafe_b64decode(signature_encoded + "=" * (-len(signature_encoded) % 4))
            fields = payload.decode("utf-8").split("")
            if len(fields) != 5:
                return False
            token_profile, token_lineage, token_turn, token_target, expiry_text = fields
            expires_at = int(expiry_text)
        except (ValueError, UnicodeError, binascii.Error):
            return False
        expected_payload = self._payload(profile, lineage, turn_id, target_id, expires_at)
        expected_signature = hmac.new(self._secret, expected_payload, hashlib.sha256).digest()
        return (
            hmac.compare_digest(payload, expected_payload)
            and hmac.compare_digest(signature, expected_signature)
            and expires_at >= int(self._now())
            and token_profile == profile
            and token_lineage == lineage
            and token_turn == turn_id
            and token_target == target_id
        )


class TargetCatalog:
    CAPABILITY = "composer.turn-target.v1"

    def __init__(
        self,
        targets: list[TargetSpec],
        *,
        max_cost_class: str = "standard",
        allow_cross_provider: bool = True,
    ):
        if max_cost_class not in _COST_RANK:
            raise CatalogError("catalog_invalid", f"unknown max cost class: {max_cost_class}")
        by_id: dict[str, TargetSpec] = {}
        quality_ranks: set[int] = set()
        if len(targets) > 64:
            raise CatalogError("catalog_invalid", "target catalog exceeds 64 entries")
        for target in targets:
            if not target.id or len(target.id) > 64 or any(char not in _TARGET_ID_CHARS for char in target.id):
                raise CatalogError("catalog_invalid", f"invalid target id: {target.id}")
            if target.id in by_id:
                raise CatalogError("catalog_invalid", f"duplicate target id: {target.id}")
            if target.cost_class not in _COST_RANK:
                raise CatalogError("catalog_invalid", f"invalid cost class for {target.id}")
            if len(target.label) > 128:
                raise CatalogError("catalog_invalid", f"target label is too long: {target.id}")
            if not _MODEL_TOKEN_RE.fullmatch(target.provider) or not _MODEL_TOKEN_RE.fullmatch(target.model):
                raise CatalogError("catalog_invalid", f"provider/model token is invalid for {target.id}")
            if target.reasoning_effort and target.reasoning_effort not in _REASONING_LEVELS:
                raise CatalogError("catalog_invalid", f"reasoning effort is invalid for {target.id}")
            if target.quality_rank is not None:
                if target.quality_rank in quality_ranks:
                    raise CatalogError("catalog_invalid", f"duplicate quality_rank: {target.quality_rank}")
                quality_ranks.add(target.quality_rank)
            by_id[target.id] = target
        if not by_id:
            raise CatalogError("catalog_invalid", "at least one target is required")
        self._targets = by_id
        self.max_cost_class = max_cost_class
        self.allow_cross_provider = allow_cross_provider

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TargetCatalog":
        if data.get("schema_version") != 1:
            raise CatalogError("catalog_invalid", "unsupported catalog schema version")
        raw_targets = data.get("targets")
        if not isinstance(raw_targets, list):
            raise CatalogError("catalog_invalid", "targets must be a list")
        targets = []
        for raw in raw_targets:
            if not isinstance(raw, dict):
                raise CatalogError("catalog_invalid", "each target must be an object")
            targets.append(
                TargetSpec(
                    id=str(raw.get("id") or ""),
                    label=str(raw.get("label") or raw.get("id") or ""),
                    provider=str(raw.get("provider") or ""),
                    model=str(raw.get("model") or ""),
                    quality_rank=_strict_optional_rank(raw),
                    reasoning_effort=(str(raw["reasoning_effort"]) if raw.get("reasoning_effort") else None),
                    cost_class=str(raw.get("cost_class") or "standard"),
                    enabled=_strict_bool(raw, "enabled", True),
                    requires_approval=_strict_bool(raw, "requires_approval", False),
                )
            )
        return cls(
            targets,
            max_cost_class=str(data.get("max_cost_class") or "standard"),
            allow_cross_provider=_strict_bool(data, "allow_cross_provider", True),
        )

    @classmethod
    def load(cls, path: str | Path) -> "TargetCatalog":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def capabilities(self) -> dict[str, Any]:
        return {
            "capability": self.CAPABILITY,
            "protocol_version": 1,
            "max_cost_class": self.max_cost_class,
            "allow_cross_provider": self.allow_cross_provider,
            "targets": [
                target.public_dict()
                for target in self._targets.values()
                if target.enabled and _COST_RANK[target.cost_class] <= _COST_RANK[self.max_cost_class]
            ],
        }

    def resolve(
        self,
        target_id: str,
        *,
        current_provider: str | None,
        approved: bool = False,
    ) -> TargetSpec:
        target = self._targets.get(target_id)
        if target is None:
            raise CatalogError("target_unknown", f"unknown routing target: {target_id}")
        if not target.enabled:
            raise CatalogError("target_disabled", f"routing target is disabled: {target_id}")
        if _COST_RANK[target.cost_class] > _COST_RANK[self.max_cost_class]:
            raise CatalogError("cost_cap_exceeded", f"routing target exceeds the configured cost cap: {target_id}")
        if not self.allow_cross_provider:
            if not current_provider:
                raise CatalogError("current_provider_unavailable", "current provider is unavailable")
            if target.provider != current_provider:
                raise CatalogError("cross_provider_denied", f"cross-provider routing is disabled: {target_id}")
        if target.requires_approval and not approved:
            raise CatalogError("approval_required", f"routing target requires approval: {target_id}")
        return target
