import { readFile } from 'node:fs/promises'

const plugin = await readFile('integrations/hermes/desktop/plugin.js', 'utf8')
const pluginSource = await readFile('integrations/hermes/desktop/plugin-entry.ts', 'utf8')
for (const marker of [
  'Hermes Turn Router',
  'routingIntent',
  'router.capabilities',
  'Best once',
  'BYPASS',
  'Policy mismatch',
  'targets compatible',
  'CHECKING',
  'BEST \\xB7 ARMED',
  'native Hermes send'
]) {
  if (!plugin.includes(marker)) throw new Error(`Desktop plugin is missing marker: ${marker}`)
}
if (plugin.includes('modelOverride')) throw new Error('Desktop plugin contains a client model override')
if (pluginSource.includes('host.notify(')) throw new Error('Routine Router state must not create dismissible toasts')
if (!pluginSource.includes("ctx.storage.get('settings', { mode: DEFAULT_ROUTER_MODE })")) {
  throw new Error('Desktop plugin must use the exported off-by-default mode for fresh storage')
}
if (plugin.includes('\uFFFD')) throw new Error('Desktop plugin contains a Unicode replacement character')
console.log('Desktop plugin smoke tests passed')
