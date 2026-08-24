#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { codexLunaSolPolicy } from './presets.js'
import { replayPolicy, type ReplayEvent } from './replay.js'
import { routeMessage, validatePolicy } from './router.js'
import type { RouterMode, RouterPolicy } from './types.js'

function usage(): never {
  console.error(`Hermes Turn Router

Usage:
  hermes-turn-router validate [--policy file.json]
  hermes-turn-router route --text "message" [--policy file.json] [--mode auto|save|quality|fixed|off]
      [--fixed target] [--once target] [--allow a,b,c] [--context-tokens N]
      [--current-provider slug --current-model slug --current-reasoning effort]
  hermes-turn-router replay --input events.ndjson [--policy file.json]

The default policy is the bundled Codex Luna/Sol reference preset.
All output is local JSON. Replay output is aggregate-only and does not echo prompts.`)
  process.exit(2)
}

function argsOf(argv: string[]): { command: string; values: Map<string, string> } {
  const [command, ...rest] = argv
  if (!command) usage()
  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!
    if (!token.startsWith('--')) usage()
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) usage()
    values.set(token.slice(2), value)
    index += 1
  }
  return { command, values }
}

function loadPolicy(path: string | undefined): RouterPolicy {
  if (!path) return codexLunaSolPolicy
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as RouterPolicy
}

function numberValue(values: Map<string, string>, key: string): number | undefined {
  const raw = values.get(key)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${key} must be a non-negative number`)
  return value
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`)
}

function main(): void {
  const { command, values } = argsOf(process.argv.slice(2))
  const policy = loadPolicy(values.get('policy'))
  validatePolicy(policy)

  if (command === 'validate') {
    print({ ok: true, version: policy.version, targets: policy.tiers.map(tier => tier.id) })
    return
  }

  if (command === 'route') {
    const text = values.get('text')
    if (!text) throw new Error('--text is required')
    const mode = (values.get('mode') ?? 'auto') as RouterMode
    const allowedTargetIds = values.get('allow')?.split(',').map(value => value.trim()).filter(Boolean)
    const currentProvider = values.get('current-provider')
    const currentModel = values.get('current-model')
    const currentReasoningEffort = values.get('current-reasoning')
    const state = currentProvider && currentModel
      ? { currentProvider, currentModel, ...(currentReasoningEffort ? { currentReasoningEffort } : {}) }
      : undefined
    const decision = routeMessage({
      text,
      mode,
      policy,
      ...(values.get('fixed') ? { fixedTierId: values.get('fixed')! } : {}),
      ...(values.get('once') ? { oneShotTierId: values.get('once')! } : {}),
      ...(allowedTargetIds ? { allowedTargetIds } : {}),
      ...(numberValue(values, 'context-tokens') !== undefined
        ? { estimatedContextTokens: numberValue(values, 'context-tokens')! }
        : {}),
      ...(state ? { state } : {})
    })
    print(decision)
    return
  }

  if (command === 'replay') {
    const input = values.get('input')
    if (!input) throw new Error('--input is required')
    const events = readFileSync(resolve(input), 'utf8')
      .split(new RegExp('\\r?\\n'))
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line) as ReplayEvent
        } catch {
          throw new Error(`Invalid JSON on replay line ${index + 1}`)
        }
      })
    print(replayPolicy(policy, events))
    return
  }

  usage()
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
