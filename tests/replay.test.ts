import { describe, expect, it } from 'vitest'
import { codexLunaSolPolicy } from '../src/presets.js'
import { replayPolicy } from '../src/replay.js'

describe('replayPolicy', () => {
  it('returns aggregate diagnostics without echoing prompt text', () => {
    const summary = replayPolicy(codexLunaSolPolicy, [
      { text: '你好', expectedTierId: 'fast' },
      { text: '请认真深入审查这个架构', expectedTierId: 'premium' },
      { text: '任意消息', mode: 'off' }
    ])

    expect(summary).toMatchObject({
      totalEvents: 3,
      routedEvents: 2,
      bypassedEvents: 1,
      errors: 0,
      expectationChecks: 2,
      expectationMatches: 2
    })
    expect(JSON.stringify(summary)).not.toContain('请认真')
  })

  it('aggregates observed usage without storing prompts', () => {
    const summary = replayPolicy(codexLunaSolPolicy, [
      {
        text: 'first private fixture',
        observed: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10, latencyMs: 100, verificationPassed: true }
      },
      {
        text: 'second private fixture',
        observed: { inputTokens: 200, cachedInputTokens: 160, outputTokens: 20, latencyMs: 300, verificationPassed: false, reanswered: true }
      }
    ])
    expect(summary).toMatchObject({
      observedEvents: 2,
      inputTokens: 300,
      cachedInputTokens: 200,
      outputTokens: 30,
      averageLatencyMs: 200,
      verificationFailures: 1,
      reanswers: 1
    })
    expect(summary.cacheReadRatio).toBeCloseTo(2 / 3)
    expect(JSON.stringify(summary)).not.toContain('private fixture')
  })

  it('aggregates policy errors instead of stopping the whole replay', () => {
    const summary = replayPolicy(codexLunaSolPolicy, [
      { text: 'hello', oneShotTierId: 'premium', allowedTargetIds: ['fast'] },
      { text: 'hello' }
    ])
    expect(summary.errors).toBe(1)
    expect(summary.routedEvents).toBe(1)
  })
})
