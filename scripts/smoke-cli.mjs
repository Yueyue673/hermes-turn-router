import { spawnSync } from 'node:child_process'

const commands = [
  ['validate'],
  ['route', '--text', '请认真深入审查这个架构', '--allow', 'fast,balanced,premium'],
  ['replay', '--input', 'examples/replay.ndjson']
]

for (const args of commands) {
  const result = spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || `CLI failed: ${args.join(' ')}`)
  JSON.parse(result.stdout)
}
console.log('CLI smoke tests passed')
