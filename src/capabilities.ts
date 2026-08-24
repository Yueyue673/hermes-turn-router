export const HERMES_TURN_TARGET_CAPABILITY = 'composer.turn-target.v1'

export interface PublicRoutingTarget {
  id: string
  label: string
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
