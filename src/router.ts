import type {
  ModelTarget,
  RouteDecision,
  RouteInput,
  RouterPolicy,
  SignalRule
} from './types.js'

const SAFE_PATTERN_FLAGS = /^[gimsuy]*$/

function compile(rule: SignalRule): RegExp {
  const flags = rule.flags ?? 'i'
  if (!SAFE_PATTERN_FLAGS.test(flags)) {
    throw new Error(`Invalid regex flags for signal ${rule.id}`)
  }
  return new RegExp(rule.pattern, flags)
}

function matchesAny(patterns: string[], text: string): boolean {
  return patterns.some(pattern => new RegExp(pattern, 'i').test(text))
}

export function validatePolicy(policy: RouterPolicy): void {
  if (policy.version !== 1) throw new Error('Unsupported policy version')
  if (policy.tiers.length < 2) throw new Error('At least two model tiers are required')

  const ids = new Set<string>()
  let previous = Number.NEGATIVE_INFINITY
  for (const tier of policy.tiers) {
    if (!tier.id || ids.has(tier.id)) throw new Error(`Duplicate or empty tier id: ${tier.id}`)
    if (!tier.provider || !tier.model) throw new Error(`Tier ${tier.id} must declare provider and model`)
    if (tier.minScore < previous) throw new Error('Tiers must be sorted by non-decreasing minScore')
    ids.add(tier.id)
    previous = tier.minScore
  }

  if (!ids.has(policy.safetyFloorTierId)) throw new Error('safetyFloorTierId must reference a tier')
  for (const rule of policy.signals) compile(rule)
  for (const pattern of [...policy.simpleRequestPatterns, ...policy.continuationPatterns]) {
    new RegExp(pattern, 'i')
  }
}

function tierIndex(policy: RouterPolicy, id: string): number {
  return policy.tiers.findIndex(tier => tier.id === id)
}

function currentTier(policy: RouterPolicy, input: RouteInput): ModelTarget | undefined {
  const state = input.state
  if (!state?.currentModel || !state.currentProvider) return undefined
  return policy.tiers.find(tier =>
    tier.model === state.currentModel &&
    tier.provider === state.currentProvider &&
    (tier.reasoningEffort ?? '') === (state.currentReasoningEffort ?? '')
  )
}

function availableTiers(input: RouteInput): ModelTarget[] {
  if (!input.allowedTargetIds) return input.policy.tiers
  const allowed = new Set(input.allowedTargetIds)
  const tiers = input.policy.tiers.filter(tier => allowed.has(tier.id))
  if (tiers.length === 0) throw new Error('No allowed routing targets are available')
  return tiers
}

function chooseTier(tiers: ModelTarget[], score: number): ModelTarget {
  let selected = tiers[0]!
  for (const tier of tiers) {
    if (score >= tier.minScore) selected = tier
  }
  return selected
}

function contextPenalty(policy: RouterPolicy, tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0
  return Math.min(policy.maxContextPenalty, Math.floor(tokens / policy.contextTokenStep))
}

function cacheRisk(tokens: number, switched: boolean): RouteDecision['cacheRisk'] {
  if (!switched) return 'none'
  if (tokens >= 32_000) return 'high'
  if (tokens >= 8_000) return 'medium'
  return 'low'
}

function sameTarget(a: ModelTarget | undefined, b: ModelTarget): boolean {
  return Boolean(a && a.provider === b.provider && a.model === b.model &&
    (a.reasoningEffort ?? '') === (b.reasoningEffort ?? ''))
}

export function routeMessage(input: RouteInput): RouteDecision | null {
  validatePolicy(input.policy)
  const text = input.text.trim()
  if (!text || input.mode === 'off') return null

  const policy = input.policy
  const candidates = availableTiers(input)
  const detectedCurrent = currentTier(policy, input)
  const current = detectedCurrent && candidates.some(tier => tier.id === detectedCurrent.id)
    ? detectedCurrent
    : undefined
  const estimatedTokens = Math.max(0, input.estimatedContextTokens ?? 0)
  const penalty = contextPenalty(policy, estimatedTokens)
  const findTier = (id: string): ModelTarget => {
    const tier = policy.tiers.find(item => item.id === id)
    if (!tier) throw new Error(`Unknown tier: ${id}`)
    if (!candidates.some(item => item.id === id)) throw new Error(`Routing target is not allowed: ${id}`)
    return tier
  }

  const finish = (
    target: ModelTarget,
    score: number,
    rawTierId: string,
    reasons: string[],
    hysteresisApplied = false
  ): RouteDecision => {
    const switched = Boolean(current) && !sameTarget(current, target)
    return {
      target,
      score,
      rawTierId,
      reasons,
      switched,
      hysteresisApplied,
      contextPenalty: penalty,
      cacheRisk: cacheRisk(estimatedTokens, switched)
    }
  }

  if (input.oneShotTierId) {
    const target = findTier(input.oneShotTierId)
    return finish(target, Number.POSITIVE_INFINITY, target.id, ['manual_one_shot'])
  }

  if (input.mode === 'fixed') {
    if (!input.fixedTierId) throw new Error('fixedTierId is required in fixed mode')
    const target = findTier(input.fixedTierId)
    return finish(target, target.minScore, target.id, ['fixed_selection'])
  }

  if (current && matchesAny(policy.continuationPatterns, text)) {
    return finish(current, current.minScore, current.id, ['continuation_sticky'])
  }

  let score = policy.modeBias[input.mode]
  const reasons: string[] = input.mode === 'auto' ? [] : [`${input.mode}_mode`]
  let forceUpgrade = false
  let safetySignal = false

  for (const rule of policy.signals) {
    if (compile(rule).test(text)) {
      score += rule.weight
      reasons.push(rule.reasonCode)
      forceUpgrade ||= Boolean(rule.forceUpgrade)
      safetySignal ||= rule.reasonCode === 'high_impact'
    }
  }

  if (text.length >= policy.longMessageChars) {
    score += policy.longMessageWeight
    reasons.push('long_context')
  } else if (text.length >= policy.mediumMessageChars) {
    score += policy.mediumMessageWeight
    reasons.push('long_context')
  }

  if (input.hasAttachments) {
    score += policy.attachmentsWeight
    reasons.push('attachments')
  }

  if (matchesAny(policy.simpleRequestPatterns, text)) {
    score -= 35
    reasons.push('simple_request')
  }

  let raw = chooseTier(candidates, score)
  const floorIndex = tierIndex(policy, policy.safetyFloorTierId)
  if (safetySignal && tierIndex(policy, raw.id) < floorIndex) {
    const safeCandidate = candidates.find(tier => tierIndex(policy, tier.id) >= floorIndex)
    if (!safeCandidate) throw new Error('No allowed target satisfies the configured safety floor')
    raw = safeCandidate
    reasons.push('safety_floor')
  }

  if (reasons.length === 0) reasons.push('balanced_default')
  // Save and quality are explicit user choices. Hysteresis protects auto mode;
  // it must not silently override a mode the user deliberately selected.
  if (input.mode !== 'auto') {
    return finish(raw, score, raw.id, reasons)
  }
  if (!current || forceUpgrade || sameTarget(current, raw)) {
    return finish(raw, score, raw.id, reasons)
  }

  const currentIndex = tierIndex(policy, current.id)
  const rawIndex = tierIndex(policy, raw.id)
  let target = raw
  let hysteresisApplied = false

  if (
    rawIndex < currentIndex
    && estimatedTokens >= (policy.largeContextStickyTokens ?? Number.POSITIVE_INFINITY)
  ) {
    target = current
    hysteresisApplied = true
    reasons.push('large_context_sticky')
    return finish(target, score, raw.id, reasons, hysteresisApplied)
  }

  if (rawIndex > currentIndex) {
    const required = raw.minScore + policy.switchUpMargin + penalty
    if (score < required && !safetySignal) {
      target = current
      hysteresisApplied = true
      reasons.push('switch_cost_hold')
    }
  } else if (rawIndex < currentIndex) {
    const downgradeBoundary = current.minScore - policy.switchDownMargin - penalty
    if (score >= downgradeBoundary) {
      target = current
      hysteresisApplied = true
      reasons.push('switch_cost_hold')
    }
  }

  return finish(target, score, raw.id, reasons, hysteresisApplied)
}
