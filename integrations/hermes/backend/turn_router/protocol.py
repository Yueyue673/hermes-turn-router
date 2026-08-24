from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .catalog import ApprovalTokenManager, CatalogError, TargetCatalog, TargetSpec
from .ledger import LedgerResult, TurnLedger

_TOKEN_RE = re.compile(r"[A-Za-z0-9._:-]{1,128}\Z")


class TurnProtocolError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class NormalizedTurnIntent:
    client_turn_id: str
    target_id: str | None
    mode: str
    reason_codes: tuple[str, ...]
    approval_token: str | None

    def hash_payload(self, prompt_digest: str) -> dict[str, Any]:
        return {
            "client_turn_id": self.client_turn_id,
            "target_id": self.target_id,
            "mode": self.mode,
            "reason_codes": self.reason_codes,
            "prompt_digest": prompt_digest,
        }


@dataclass(frozen=True)
class PreparedTurn:
    intent: NormalizedTurnIntent
    target: TargetSpec | None
    ledger: LedgerResult
    envelope_hash: str
    profile: str
    lineage: str


class TurnCoordinator:
    def __init__(
        self,
        *,
        catalog: TargetCatalog,
        ledger: TurnLedger,
        approval_tokens: ApprovalTokenManager | None = None,
    ):
        self.catalog = catalog
        self.ledger = ledger
        self.approval_tokens = approval_tokens

    @staticmethod
    def normalize(raw: Any) -> NormalizedTurnIntent:
        if not isinstance(raw, dict):
            raise TurnProtocolError("turn_invalid", "turn intent must be an object")
        turn_id = str(raw.get("clientTurnId") or raw.get("client_turn_id") or "").strip()
        if not _TOKEN_RE.fullmatch(turn_id):
            raise TurnProtocolError("turn_invalid", "client turn id is invalid")
        if raw.get("modelOverride") is not None or raw.get("model_override") is not None:
            raise TurnProtocolError("turn_invalid", "client model overrides are not accepted")
        routing = raw.get("routingIntent") or raw.get("routing_intent")
        if routing is None:
            return NormalizedTurnIntent(
                client_turn_id=turn_id,
                target_id=None,
                mode="off",
                reason_codes=(),
                approval_token=None,
            )
        if not isinstance(routing, dict):
            raise TurnProtocolError("turn_invalid", "routing intent must be an object")
        target_id = str(routing.get("targetId") or routing.get("target_id") or "").strip()
        if not _TOKEN_RE.fullmatch(target_id):
            raise TurnProtocolError("turn_invalid", "target id is invalid")
        mode = str(routing.get("mode") or "auto")[:32]
        reason_codes = tuple(
            str(value)[:80]
            for value in (routing.get("reasonCodes") or routing.get("reason_codes") or [])
            if isinstance(value, str)
        )[:16]
        approval_token = routing.get("approvalToken") or routing.get("approval_token")
        return NormalizedTurnIntent(
            client_turn_id=turn_id,
            target_id=target_id,
            mode=mode,
            reason_codes=reason_codes,
            approval_token=str(approval_token) if approval_token else None,
        )

    def prepare(
        self,
        raw: Any,
        *,
        profile: str,
        lineage: str,
        prompt_digest: str,
        current_provider: str | None,
    ) -> PreparedTurn:
        intent = self.normalize(raw)
        approved = bool(
            intent.target_id
            and self.approval_tokens
            and self.approval_tokens.verify(
                intent.approval_token,
                profile=profile,
                lineage=lineage,
                turn_id=intent.client_turn_id,
                target_id=intent.target_id,
            )
        )
        target = None
        if intent.target_id:
            try:
                target = self.catalog.resolve(intent.target_id, current_provider=current_provider, approved=approved)
            except CatalogError as error:
                raise TurnProtocolError(error.code, str(error)) from error
        envelope_hash = self.ledger.envelope_hash(intent.hash_payload(prompt_digest))
        ledger_result = self.ledger.reserve(
            profile=profile,
            lineage=lineage,
            turn_id=intent.client_turn_id,
            envelope_hash=envelope_hash,
        )
        if ledger_result.outcome == "conflict":
            raise TurnProtocolError("turn_conflict", "client turn id was reused with different content or routing")
        return PreparedTurn(intent, target, ledger_result, envelope_hash, profile, lineage)

    @staticmethod
    def _lease(prepared: PreparedTurn) -> str:
        if not prepared.ledger.lease_id:
            raise TurnProtocolError("turn_lease_lost", "turn reservation has no active lease")
        return prepared.ledger.lease_id

    def accept(self, prepared: PreparedTurn) -> bool:
        return self.ledger.accept(
            profile=prepared.profile,
            lineage=prepared.lineage,
            turn_id=prepared.intent.client_turn_id,
            lease_id=self._lease(prepared),
            envelope_hash=prepared.envelope_hash,
        )

    def complete(self, prepared: PreparedTurn) -> bool:
        return self.ledger.complete(
            profile=prepared.profile,
            lineage=prepared.lineage,
            turn_id=prepared.intent.client_turn_id,
            lease_id=self._lease(prepared),
            envelope_hash=prepared.envelope_hash,
        )

    def release(self, prepared: PreparedTurn) -> bool:
        return self.ledger.release(
            profile=prepared.profile,
            lineage=prepared.lineage,
            turn_id=prepared.intent.client_turn_id,
            lease_id=self._lease(prepared),
            envelope_hash=prepared.envelope_hash,
        )
