import { execFileSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const path = join(tmpdir(), `hermes-turn-router-policy-${process.pid}.json`)
const policy = {
  version: 1,
  tiers: [
    { id: 'fast', label: 'Local fast', provider: 'lmstudio', model: 'local-fast-model', minScore: -100 },
    { id: 'balanced', label: 'Cloud balanced', provider: 'custom', model: 'cloud-balanced-model', minScore: 25 }
  ],
  signals: [{ id: 'complex', reasonCode: 'complex_reasoning', pattern: 'architecture', weight: 35 }],
  simpleRequestPatterns: ['^hello$'],
  continuationPatterns: ['^continue$'],
  modeBias: { auto: 0, save: -28, quality: 25 },
  attachmentsWeight: 11,
  mediumMessageChars: 180,
  mediumMessageWeight: 16,
  longMessageChars: 600,
  longMessageWeight: 30,
  safetyFloorTierId: 'balanced',
  switchUpMargin: 10,
  switchDownMargin: 12,
  contextTokenStep: 4000,
  maxContextPenalty: 20,
  largeContextStickyTokens: 32000
}

try {
  await writeFile(path, JSON.stringify(policy))
  execFileSync(process.execPath, ['scripts/build-hermes-plugin.mjs'], {
    stdio: 'pipe',
    env: { ...process.env, HERMES_TURN_ROUTER_POLICY: path }
  })
  const custom = await readFile('integrations/hermes/desktop/plugin.js', 'utf8')
  if (!custom.includes('local-fast-model') || !custom.includes('cloud-balanced-model')) {
    throw new Error('Custom Desktop policy was not embedded in the plugin bundle')
  }
} finally {
  await rm(path, { force: true })
  execFileSync(process.execPath, ['scripts/build-hermes-plugin.mjs'], { stdio: 'pipe' })
}

const restored = await readFile('integrations/hermes/desktop/plugin.js', 'utf8')
if (restored.includes('local-fast-model')) throw new Error('Default Desktop plugin was not restored')
console.log('Custom Desktop policy build test passed')
