import { describe, expect, it } from 'vitest'
import { codexLunaSolPolicy } from '../src/presets.js'
import { routeMessageSafely } from '../src/safe-route.js'

const base = { text: 'hello', mode: 'auto' as const, policy: codexLunaSolPolicy }

describe('routeMessageSafely', () => {
  it('returns a normal decision for compatible targets', () => {
    const result = routeMessageSafely({ ...base, allowedTargetIds: ['fast', 'balanced'] })
    expect(result.error).toBeNull()
    expect(result.decision?.target.id).toBe('fast')
  })

  it('turns an unknown-only capability intersection into a bypass result', () => {
    const result = routeMessageSafely({ ...base, allowedTargetIds: ['custom'] })
    expect(result.decision).toBeNull()
    expect(result.error).toContain('No allowed routing targets')
  })

  it('turns a disallowed one-shot target into a bypass result', () => {
    const result = routeMessageSafely({
      ...base,
      oneShotTierId: 'premium',
      allowedTargetIds: ['fast', 'balanced']
    })
    expect(result.decision).toBeNull()
    expect(result.error).toContain('not allowed')
  })
})
