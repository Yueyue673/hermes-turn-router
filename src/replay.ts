import { routeMessage } from './router.js'
import type { RouteInput, RouterMode, RouterPolicy, RouterState } from './types.js'

export interface ReplayObservation {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  latencyMs?: number
  verificationPassed?: boolean
  reanswered?: boolean
}

export interface ReplayEvent {
  text: string
  mode?: RouterMode
  fixedTierId?: string
  oneShotTierId?: string
  hasAttachments?: boolean
  estimatedContextTokens?: number
  allowedTargetIds?: string[]
  state?: RouterState
  expectedTierId?: string
  observed?: ReplayObservation
}

export interface ReplaySummary {
  totalEvents: number
  routedEvents: number
  bypassedEvents: number
  errors: number
  switches: number
  switchRate: number
  expectationChecks: number
  expectationMatches: number
  expectationAccuracy: number | null
  byTarget: Record<string, number>
  byCacheRisk: Record<string, number>
  byReason: Record<string, number>
  errorMessages: Record<string, number>
  observedEvents: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  cacheReadRatio: number | null
  averageLatencyMs: number | null
  verificationFailures: number
  reanswers: number
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1
}

export function replayPolicy(policy: RouterPolicy, events: ReplayEvent[]): ReplaySummary {
  const summary: ReplaySummary = {
    totalEvents: events.length,
    routedEvents: 0,
    bypassedEvents: 0,
    errors: 0,
    switches: 0,
    switchRate: 0,
    expectationChecks: 0,
    expectationMatches: 0,
    expectationAccuracy: null,
    byTarget: {},
    byCacheRisk: {},
    byReason: {},
    errorMessages: {},
    observedEvents: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    cacheReadRatio: null,
    averageLatencyMs: null,
    verificationFailures: 0,
    reanswers: 0
  }
  let latencySamples = 0
  let latencyTotal = 0

  for (const event of events) {
    try {
      const input: RouteInput = {
        text: event.text,
        mode: event.mode ?? 'auto',
        policy,
        ...(event.fixedTierId ? { fixedTierId: event.fixedTierId } : {}),
        ...(event.oneShotTierId ? { oneShotTierId: event.oneShotTierId } : {}),
        ...(event.hasAttachments !== undefined ? { hasAttachments: event.hasAttachments } : {}),
        ...(event.estimatedContextTokens !== undefined ? { estimatedContextTokens: event.estimatedContextTokens } : {}),
        ...(event.allowedTargetIds ? { allowedTargetIds: event.allowedTargetIds } : {}),
        ...(event.state ? { state: event.state } : {})
      }
      const decision = routeMessage(input)
      if (!decision) {
        summary.bypassedEvents += 1
        continue
      }

      summary.routedEvents += 1
      if (decision.switched) summary.switches += 1
      increment(summary.byTarget, decision.target.id)
      increment(summary.byCacheRisk, decision.cacheRisk)
      for (const reason of decision.reasons) increment(summary.byReason, reason)

      if (event.expectedTierId) {
        summary.expectationChecks += 1
        if (event.expectedTierId === decision.target.id) summary.expectationMatches += 1
      }
      if (event.observed) {
        summary.observedEvents += 1
        summary.inputTokens += Math.max(0, event.observed.inputTokens ?? 0)
        summary.cachedInputTokens += Math.max(0, event.observed.cachedInputTokens ?? 0)
        summary.outputTokens += Math.max(0, event.observed.outputTokens ?? 0)
        if (event.observed.latencyMs !== undefined && event.observed.latencyMs >= 0) {
          latencySamples += 1
          latencyTotal += event.observed.latencyMs
        }
        if (event.observed.verificationPassed === false) summary.verificationFailures += 1
        if (event.observed.reanswered === true) summary.reanswers += 1
      }
    } catch (error) {
      summary.errors += 1
      increment(summary.errorMessages, error instanceof Error ? error.message : String(error))
    }
  }

  summary.switchRate = summary.routedEvents === 0 ? 0 : summary.switches / summary.routedEvents
  summary.expectationAccuracy = summary.expectationChecks === 0
    ? null
    : summary.expectationMatches / summary.expectationChecks
  summary.cacheReadRatio = summary.inputTokens === 0 ? null : summary.cachedInputTokens / summary.inputTokens
  summary.averageLatencyMs = latencySamples === 0 ? null : latencyTotal / latencySamples
  return summary
}
