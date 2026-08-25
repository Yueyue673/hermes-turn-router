import { describe, expect, it, vi } from 'vitest'
import { compatibleTargetIds, requestHermesCapabilities, validateHermesCapabilities } from '../src/capabilities.js'
import { codexLunaSolPolicy } from '../src/presets.js'

const capability = {
  capability: 'composer.turn-target.v1',
  protocol_version: 1,
  max_cost_class: 'premium',
  allow_cross_provider: false,
  targets: [{ id: 'fast', label: 'Fast', cost_class: 'low', enabled: true, requires_approval: false }]
} as const

describe('validateHermesCapabilities', () => {
  it('accepts the negotiated v1 capability', () => {
    expect(validateHermesCapabilities(capability).targets[0]?.id).toBe('fast')
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

  it('intersects enabled, pre-authorized capability targets with the local policy', () => {
    const negotiated = validateHermesCapabilities({
      ...capability,
      targets: [
        { id: 'fast', label: 'Fast', cost_class: 'low', enabled: true, requires_approval: false },
        { id: 'premium', label: 'Premium', cost_class: 'premium', enabled: true, requires_approval: true },
        { id: 'disabled', label: 'Disabled', cost_class: 'low', enabled: false, requires_approval: false },
        { id: 'custom', label: 'Custom', cost_class: 'low', enabled: true, requires_approval: false }
      ]
    })
    expect(compatibleTargetIds(negotiated, codexLunaSolPolicy)).toEqual(['fast'])
  })
})

describe('requestHermesCapabilities', () => {
  it('retries the Desktop startup race until the live Gateway is attached', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('Hermes gateway unavailable'))
      .mockRejectedValueOnce(new Error('Hermes gateway unavailable'))
      .mockResolvedValue(capability)
    const sleep = vi.fn(async () => undefined)

    await expect(requestHermesCapabilities(request, { attempts: 4, delayMs: 1, sleep }))
      .resolves.toMatchObject({ capability: 'composer.turn-target.v1' })
    expect(request).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('returns the last error after a bounded number of attempts', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Hermes gateway unavailable'))

    await expect(requestHermesCapabilities(request, {
      attempts: 2,
      delayMs: 0,
      sleep: async () => undefined
    })).rejects.toThrow('Hermes gateway unavailable')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
