import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { codexLunaSolPolicy, routeMessage, validatePolicy } from '../src/index.js'
import type { RouterPolicy } from '../src/types.js'

const base = { mode: 'auto' as const, policy: codexLunaSolPolicy }

describe('routeMessage', () => {
  it('uses no classifier call and routes simple requests locally', () => {
    const decision = routeMessage({ ...base, text: '你好' })
    expect(decision?.target.id).toBe('fast')
    expect(decision?.reasons).toContain('simple_request')
  })

  it('routes explicit quality directly to premium', () => {
    const decision = routeMessage({ ...base, text: '请认真想清楚，用最好的模型深入分析' })
    expect(decision?.target.id).toBe('premium')
    expect(decision?.reasons).toContain('explicit_quality')
  })

  it('keeps a complex continuation on the current model', () => {
    const decision = routeMessage({
      ...base,
      text: '你继续',
      state: { currentProvider: 'openai-codex', currentModel: 'gpt-5.6-sol', currentReasoningEffort: 'medium' }
    })
    expect(decision?.target.id).toBe('balanced')
    expect(decision?.switched).toBe(false)
  })

  it('raises the switching threshold for a long cached conversation', () => {
    const decision = routeMessage({
      ...base,
      text: '帮我分析一下这个自动化想法和长期方案',
      estimatedContextTokens: 48_000,
      state: { currentProvider: 'openai-codex', currentModel: 'gpt-5.6-luna', currentReasoningEffort: 'medium' }
    })
    expect(decision?.rawTierId).toBe('balanced')
    expect(decision?.target.id).toBe('fast')
    expect(decision?.hysteresisApplied).toBe(true)
    expect(decision?.reasons).toContain('switch_cost_hold')
    expect(decision?.cacheRisk).toBe('none')
  })

  it('keeps a large established Sol High session on its cached target', () => {
    const decision = routeMessage({
      ...base,
      text: '介绍一下这些模式分别是什么意思',
      estimatedContextTokens: 360_000,
      state: {
        currentProvider: 'openai-codex',
        currentModel: 'gpt-5.6-sol',
        currentReasoningEffort: 'high'
      }
    })
    expect(decision?.rawTierId).toBe('fast')
    expect(decision?.target.id).toBe('strong')
    expect(decision?.reasons).toContain('large_context_sticky')
    expect(decision?.switched).toBe(false)
  })

  it('applies explicit save and quality modes without auto hysteresis', () => {
    const current = {
      currentProvider: 'openai-codex',
      currentModel: 'gpt-5.6-sol',
      currentReasoningEffort: 'high'
    }
    expect(routeMessage({ ...base, mode: 'save', text: '普通问题', state: current })?.target.id).toBe('fast')
    expect(routeMessage({ ...base, mode: 'quality', text: '普通问题', state: current })?.target.id).toBe('balanced')
  })

  it('never lets save mode push a high-impact action below the safety floor', () => {
    const decision = routeMessage({ ...base, mode: 'save', text: '省额度，然后迁移生产数据库并部署' })
    expect(['balanced', 'premium']).toContain(decision?.target.id)
    expect(decision?.reasons).toContain('high_impact')
  })

  it('honors fixed and one-shot choices', () => {
    expect(routeMessage({ ...base, mode: 'fixed', fixedTierId: 'fast', text: '任意消息' })?.target.id).toBe('fast')
    expect(routeMessage({ ...base, mode: 'save', oneShotTierId: 'premium', text: '好的' })?.target.id).toBe('premium')
  })

  it('never selects or accepts a target outside the server-verified allowlist', () => {
    const decision = routeMessage({
      ...base,
      text: '请认真深入分析',
      allowedTargetIds: ['fast', 'balanced']
    })
    expect(decision?.target.id).toBe('balanced')
    expect(() => routeMessage({
      ...base,
      text: '好的',
      oneShotTierId: 'premium',
      allowedTargetIds: ['fast', 'balanced']
    })).toThrow('not allowed')
  })

  it('reports cache risk instead of pretending a switch is free', () => {
    expect(routeMessage({ ...base, text: '你好' })?.switched).toBe(false)
    const decision = routeMessage({
      ...base,
      text: '请认真深入分析',
      estimatedContextTokens: 40_000,
      state: { currentProvider: 'openai-codex', currentModel: 'gpt-5.6-luna', currentReasoningEffort: 'medium' }
    })
    expect(decision?.switched).toBe(true)
    expect(decision?.cacheRisk).toBe('high')
  })

  it('loads and validates the published JSON preset', () => {
    const policy = JSON.parse(readFileSync('presets/codex-luna-sol.json', 'utf8')) as RouterPolicy
    expect(() => validatePolicy(policy)).not.toThrow()
  })

  it('routes arbitrary provider targets instead of depending on Codex names', () => {
    const policy: RouterPolicy = {
      ...codexLunaSolPolicy,
      tiers: [
        { id: 'local', label: 'Local', provider: 'lmstudio', model: 'small-local', minScore: -100 },
        { id: 'cloud', label: 'Cloud', provider: 'custom', model: 'large-cloud', minScore: 25 }
      ],
      safetyFloorTierId: 'cloud'
    }
    const decision = routeMessage({ text: '请分析这个系统架构', mode: 'auto', policy })
    expect(decision?.target).toMatchObject({ provider: 'custom', model: 'large-cloud' })
  })
})
