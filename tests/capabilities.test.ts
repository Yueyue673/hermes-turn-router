import { describe, expect, it } from 'vitest'
import { validateHermesCapabilities } from '../src/capabilities.js'

describe('validateHermesCapabilities', () => {
  it('accepts the negotiated v1 capability', () => {
    expect(validateHermesCapabilities({
      capability: 'composer.turn-target.v1',
      protocol_version: 1,
      max_cost_class: 'premium',
      allow_cross_provider: false,
      targets: [{ id: 'fast', label: 'Fast', cost_class: 'low', enabled: true, requires_approval: false }]
    }).targets[0]?.id).toBe('fast')
  })

  it('rejects malformed target metadata', () => {
    expect(() => validateHermesCapabilities({
      capability: 'composer.turn-target.v1',
      protocol_version: 1,
      max_cost_class: 'unknown',
      allow_cross_provider: 'no',
      targets: [{ id: 'bad target', label: 42, cost_class: 'infinite', enabled: 'yes', requires_approval: 0 }]
    })).toThrow('invalid routing policy metadata')
  })

  it('fails explicitly on an incompatible gateway', () => {
    expect(() => validateHermesCapabilities({ capability: 'legacy', protocol_version: 0, targets: [] }))
      .toThrow('does not support')
  })
})
