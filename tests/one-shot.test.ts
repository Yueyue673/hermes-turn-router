import { describe, expect, it } from 'vitest'
import { OneShotController } from '../src/one-shot.js'

describe('OneShotController', () => {
  it('consumes an override only after the matching turn is accepted', () => {
    const controller = new OneShotController()
    controller.arm('premium')
    expect(controller.snapshot('turn-1')?.targetId).toBe('premium')
    expect(controller.current()).toBe('premium')
    expect(controller.accepted('turn-1')).toBe(true)
    expect(controller.current()).toBeNull()
  })

  it('keeps the override armed after rejection and preserves retry snapshots', () => {
    const controller = new OneShotController()
    controller.arm('premium')
    const first = controller.snapshot('turn-1')
    expect(controller.snapshot('turn-1')).toEqual(first)
    controller.rejected('turn-1')
    expect(controller.current()).toBe('premium')
    expect(controller.snapshot('turn-2')?.targetId).toBe('premium')
  })

  it('does not consume a newer arm from an older accepted turn', () => {
    const controller = new OneShotController()
    controller.arm('balanced')
    controller.snapshot('turn-old')
    controller.arm('premium')
    expect(controller.accepted('turn-old')).toBe(false)
    expect(controller.current()).toBe('premium')
  })
})
