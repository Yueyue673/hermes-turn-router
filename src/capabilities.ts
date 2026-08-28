import type { RouterPolicy } from './types.js'

export const HERMES_TURN_TARGET_CAPABILITY = 'composer.turn-target.v1'

export interface PublicRoutingTarget {
  id: string
  label: string
  /** Gateway-authorized quality order. Missing means Best once is unavailable. */
  quality_rank?: number
  cost_class: 'free' | 'low' | 'standard' | 'premium'
  enabled: boolean
  requires_approval: boolean
}

export interface HermesRoutingCapabilities {
  capability: string
  protocol_version: number
  max_cost_class: PublicRoutingTarget['cost_class']
  allow_cross_provider: boolean
  targets: PublicRoutingTarget[]
}

export interface CapabilityRetryOptions {
  attempts?: number
  delayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

export function compatibleTargetIds(
  capabilities: HermesRoutingCapabilities,
  policy: RouterPolicy
): string[] {
  const policyIds = new Set(policy.tiers.map(target => target.id))
  return capabilities.targets
    .filter(target => target.enabled && !target.requires_approval && policyIds.has(target.id))
    .map(target => target.id)
}

export function bestCompatibleTargetId(
  capabilities: HermesRoutingCapabilities,
  policy: RouterPolicy
): string | undefined {
  const compatibleIds = new Set(compatibleTargetIds(capabilities, policy))
  const ranked = capabilities.targets.filter(target =>
    compatibleIds.has(target.id) && Number.isInteger(target.quality_rank)
  )
  if (!ranked.length) return undefined
  const highest = Math.max(...ranked.map(target => target.quality_rank as number))
  const winners = ranked.filter(target => target.quality_rank === highest)
  return winners.length === 1 ? winners[0]?.id : undefined
}

const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const COST_CLASSES = new Set(['free', 'low', 'standard', 'premium'])

export function validateHermesCapabilities(value: unknown): HermesRoutingCapabilities {
  if (!value || typeof value !== 'object') throw new Error('routing capabilities are unavailable')
  if (JSON.stringify(value).length > 65_536) throw new Error('routing capability response is too large')
  const data = value as Partial<HermesRoutingCapabilities>
  if (data.capability !== HERMES_TURN_TARGET_CAPABILITY || data.protocol_version !== 1) {
    throw new Error(`Hermes Gateway does not support ${HERMES_TURN_TARGET_CAPABILITY}`)
  }
  if (!COST_CLASSES.has(String(data.max_cost_class)) || typeof data.allow_cross_provider !== 'boolean') {
    throw new Error('Hermes Gateway returned invalid routing policy metadata')
  }
  if (!Array.isArray(data.targets) || data.targets.length === 0 || data.targets.length > 64) {
    throw new Error('Hermes Gateway returned an invalid routing target count')
  }
  const ids = new Set<string>()
  for (const target of data.targets) {
    if (
      !target
      || typeof target.id !== 'string'
      || !TARGET_ID.test(target.id)
      || ids.has(target.id)
      || typeof target.label !== 'string'
      || target.label.length > 128
      || (target.quality_rank !== undefined && (
        !Number.isInteger(target.quality_rank)
        || target.quality_rank < 0
        || target.quality_rank > 1_000_000
      ))
      || !COST_CLASSES.has(String(target.cost_class))
      || typeof target.enabled !== 'boolean'
      || typeof target.requires_approval !== 'boolean'
    ) {
      throw new Error('Hermes Gateway returned invalid routing targets')
    }
    ids.add(target.id)
  }
  return data as HermesRoutingCapabilities
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

/** Retry the brief Desktop startup race between socket state and live RPC. */
export async function requestHermesCapabilities(
  request: () => Promise<unknown>,
  options: CapabilityRetryOptions = {}
): Promise<HermesRoutingCapabilities> {
  const attempts = Math.max(1, Math.min(50, options.attempts ?? 12))
  const delayMs = Math.max(0, Math.min(5_000, options.delayMs ?? 150))
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return validateHermesCapabilities(await request())
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(delayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
