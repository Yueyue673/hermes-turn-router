import type { RouteDecision } from '../../src/types.js'

/**
 * Secure integration intent: the client names a target, while the Gateway
 * resolves provider/model/reasoning from its own allowlisted catalog.
 */
export interface HermesTurnEnvelope {
  clientTurnId: string
  routingIntent: { mode: string; reasonCodes: string[]; targetId: string }
}

export function decisionToHermesEnvelope(
  clientTurnId: string,
  mode: string,
  decision: RouteDecision,
  existing: Partial<HermesTurnEnvelope> = {}
): HermesTurnEnvelope {
  return {
    ...existing,
    clientTurnId,
    routingIntent: {
      mode,
      reasonCodes: [...decision.reasons],
      targetId: decision.target.id
    }
  }
}
