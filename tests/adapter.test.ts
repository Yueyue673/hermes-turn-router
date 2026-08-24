import { describe, expect, it } from 'vitest'
import { decisionToHermesEnvelope } from '../integrations/hermes/adapter.js'
import { codexLunaSolPolicy, routeMessage } from '../src/index.js'

describe('Hermes adapter', () => {
  it('preserves turn identity and emits a transient model override', () => {
    const decision = routeMessage({
      mode: 'auto',
      policy: codexLunaSolPolicy,
      text: '请认真深入分析这个架构'
    })!
    const envelope = decisionToHermesEnvelope('turn-123', 'auto', decision)

    expect(envelope.clientTurnId).toBe('turn-123')
    expect(envelope.routingIntent.targetId).toBe('premium')
    expect(envelope.routingIntent.reasonCodes).toContain('explicit_quality')
  })
})
