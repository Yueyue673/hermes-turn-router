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

  it('reports expectation accuracy by public fixture category', () => {
    const summary = replayPolicy(codexLunaSolPolicy, [
      { id: 'simple-zh', category: 'simple', text: '你好', expectedTierId: 'fast' },
      { id: 'safety-zh', category: 'safety', text: '迁移生产数据库', expectedTierId: 'balanced' },
      { id: 'safety-wrong', category: 'safety', text: '删除生产备份', expectedTierId: 'premium' }
    ])

    expect(summary.byCategory).toEqual({
      simple: {
        events: 1,
        routed: 1,
        bypassed: 0,
        errors: 0,
        expectationChecks: 1,
        expectationMatches: 1,
        expectationAccuracy: 1
      },
      safety: {
        events: 2,
        routed: 2,
        bypassed: 0,
        errors: 0,
        expectationChecks: 2,
        expectationMatches: 1,
        expectationAccuracy: 0.5
      }
    })
    expect(JSON.stringify(summary)).not.toContain('迁移生产数据库')
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
