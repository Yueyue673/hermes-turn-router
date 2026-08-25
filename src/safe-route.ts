import { routeMessage } from './router.js'
import type { RouteDecision, RouteInput } from './types.js'

export interface SafeRouteResult {
  decision: RouteDecision | null
  error: string | null
}

/** Desktop boundary: invalid policy/catalog combinations bypass instead of blocking send. */
export function routeMessageSafely(input: RouteInput): SafeRouteResult {
  try {
    return { decision: routeMessage(input), error: null }
  } catch (error) {
    return {
      decision: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
