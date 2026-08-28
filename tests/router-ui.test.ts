import { describe, expect, it } from 'vitest'
import {
  compactTargetLabel,
  routerPillText,
  routerStatusTone,
  ROUTER_MODE_PRESENTATION
} from '../src/router-ui.js'

describe('router control presentation', () => {
  it('makes every mode explicit and explains its behavior', () => {
    expect(ROUTER_MODE_PRESENTATION.auto.description).toContain('every new turn')
    expect(ROUTER_MODE_PRESENTATION.save.description).toContain('lower-cost')
    expect(ROUTER_MODE_PRESENTATION.quality.description).toContain('stronger')
    expect(ROUTER_MODE_PRESENTATION.off.description).toContain('native model')
  })

  it('uses compact, stable labels for the reference target ladder', () => {
    expect(compactTargetLabel('Luna · Medium')).toBe('LUNA M')
    expect(compactTargetLabel('Sol · Medium')).toBe('SOL M')
    expect(compactTargetLabel('Sol · High')).toBe('SOL H')
    expect(compactTargetLabel('Sol · XHigh')).toBe('SOL XH')
    expect(compactTargetLabel('A very long custom provider target')).toHaveLength(14)
  })

  it('shows mode, lifecycle, target, bypass, and native-off states in the pill', () => {
    expect(routerPillText('auto', 'checking', '')).toBe('AUTO · CHECKING')
    expect(routerPillText('auto', 'routing', '')).toBe('AUTO · ROUTING')
    expect(routerPillText('auto', 'ready', 'Sol · High')).toBe('AUTO · SOL H')
    expect(routerPillText('quality', 'bypass', '')).toBe('QUALITY · BYPASS')
    expect(routerPillText('off', 'ready', 'Sol · High')).toBe('OFF · NATIVE')
  })

  it('uses distinct tones for ready, transitional, bypass, offline, and off', () => {
    expect(routerStatusTone('auto', 'ready')).toBe('good')
    expect(routerStatusTone('auto', 'checking')).toBe('warn')
    expect(routerStatusTone('auto', 'bypass')).toBe('warn')
    expect(routerStatusTone('auto', 'offline')).toBe('bad')
    expect(routerStatusTone('off', 'ready')).toBe('muted')
  })
})
