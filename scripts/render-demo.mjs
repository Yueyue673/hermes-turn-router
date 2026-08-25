import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import gifenc from 'gifenc'
import { codexLunaSolPolicy, routeMessage } from '../dist/index.js'

const { GIFEncoder, applyPalette, quantize } = gifenc

const width = 1200
const height = 675
const output = fileURLToPath(new URL('../assets/turn-routing-demo.gif', import.meta.url))
const base = {
  currentProvider: 'openai-codex',
  currentModel: 'gpt-5.6-sol',
  currentReasoningEffort: 'medium'
}
const scenarios = [
  {
    step: '01 / SIMPLE TURN',
    message: '你好',
    context: 'NEW SESSION · BASE SOL MEDIUM',
    decision: routeMessage({ text: '你好', mode: 'auto', policy: codexLunaSolPolicy, state: base })
  },
  {
    step: '02 / TECHNICAL TURN',
    message: 'Analyze the root cause of this TypeScript API error',
    context: '8K CONTEXT · BASE SOL MEDIUM',
    decision: routeMessage({ text: 'Analyze the root cause of this TypeScript API error', mode: 'auto', policy: codexLunaSolPolicy, state: base, estimatedContextTokens: 8000 })
  },
  {
    step: '03 / EXPLICIT QUALITY',
    message: 'Use the best model for the final architecture review',
    context: '16K CONTEXT · BASE SOL MEDIUM',
    decision: routeMessage({ text: 'Use the best model for the final architecture review', mode: 'auto', policy: codexLunaSolPolicy, state: base, estimatedContextTokens: 16000 })
  },
  {
    step: '04 / CACHE AFFINITY',
    message: '把这个标题改短一点',
    context: '360K CONTEXT · CURRENT SOL HIGH',
    decision: routeMessage({
      text: '把这个标题改短一点',
      mode: 'auto',
      policy: codexLunaSolPolicy,
      estimatedContextTokens: 360000,
      state: { currentProvider: 'openai-codex', currentModel: 'gpt-5.6-sol', currentReasoningEffort: 'high' }
    })
  }
]

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
const colors = { fast: '#7a756d', balanced: '#171717', strong: '#0e7c66', premium: '#ff4d00' }

function shell(inner, footer = 'DETERMINISTIC LOCAL REPLAY · NO CLASSIFIER REQUEST') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="1200" height="675" fill="#f4f1ea"/>
  <g font-family="Arial,Helvetica,sans-serif" fill="#171717">
    <line x1="48" y1="40" x2="1152" y2="40" stroke="#171717" stroke-width="2"/>
    <text x="48" y="75" font-size="15" font-weight="700">HERMES TURN ROUTER / AUTO</text>
    <text x="1152" y="75" text-anchor="end" font-size="15" font-weight="700">TURN BOUNDARY DEMO</text>
    ${inner}
    <line x1="48" y1="618" x2="1152" y2="618" stroke="#171717" stroke-width="2"/>
    <text x="48" y="650" font-size="13">${footer}</text>
  </g>
</svg>`
}

const frames = [
  {
    delay: 1300,
    svg: shell(`<text x="48" y="208" font-size="70" font-weight="800" letter-spacing="-3">ONE SESSION.</text>
    <text x="48" y="282" font-size="70" font-weight="800" letter-spacing="-3">FOUR TARGETS.</text>
    <text x="48" y="356" font-size="70" font-weight="800" letter-spacing="-3">ONE MODEL PER TURN.</text>
    <rect x="52" y="408" width="16" height="16" fill="#ff4d00"/>
    <text x="84" y="423" font-size="18" font-weight="700">AUTO RE-EVALUATES AT EACH USER MESSAGE</text>
    <text x="48" y="502" font-size="22">Queue and retry keep the selected target immutable.</text>
    <text x="48" y="536" font-size="22">Generation never switches model halfway through a response.</text>`)
  },
  ...scenarios.map(({ step, message, context, decision }, index) => {
    const target = decision.target
    const color = colors[target.id] ?? '#171717'
    const score = Number.isFinite(decision.score) ? decision.score : '∞'
    const reasons = decision.reasons.join(' · ')
    const cache = decision.cacheRisk.toUpperCase()
    return {
      delay: index === scenarios.length - 1 ? 2100 : 1700,
      svg: shell(`<text x="48" y="130" font-size="14" font-weight="700">${escape(step)}</text>
      <rect x="48" y="158" width="690" height="145" fill="#ebe7de" stroke="#171717" stroke-width="1.5"/>
      <text x="70" y="193" font-size="12" font-weight="700">USER MESSAGE</text>
      <text x="70" y="244" font-size="26" font-weight="800">${escape(message)}</text>
      <text x="70" y="281" font-size="13">${escape(context)}</text>
      <rect x="770" y="158" width="382" height="145" fill="${color}" stroke="#171717" stroke-width="1.5"/>
      <text x="792" y="193" font-size="12" font-weight="700" fill="#fff">SELECTED TARGET</text>
      <text x="792" y="242" font-size="31" font-weight="800" fill="#fff">${escape(target.label)}</text>
      <text x="792" y="278" font-size="13" fill="#fff">SCORE ${score} · ${decision.switched ? 'SWITCH' : 'NO SWITCH'}</text>
      <text x="48" y="365" font-size="13" font-weight="700">DECISION TRACE</text>
      <line x1="48" y1="383" x2="1152" y2="383" stroke="#171717"/>
      <text x="48" y="426" font-size="16">RAW TARGET</text><text x="270" y="426" font-size="18" font-weight="800">${escape(decision.rawTierId)}</text>
      <text x="48" y="470" font-size="16">REASON</text><text x="270" y="470" font-size="18" font-weight="800">${escape(reasons)}</text>
      <text x="48" y="514" font-size="16">CACHE RISK</text><text x="270" y="514" font-size="18" font-weight="800">${cache}</text>
      <text x="48" y="558" font-size="16">LIFECYCLE</text><text x="270" y="558" font-size="18" font-weight="800">RESERVED → ACCEPTED → COMPLETED</text>`)
    }
  }),
  {
    delay: 1900,
    svg: shell(`<text x="48" y="136" font-size="14" font-weight="700">05 / FAILURE BOUNDARY</text>
    <text x="48" y="228" font-size="58" font-weight="800" letter-spacing="-2">GATEWAY CAPABILITY</text>
    <text x="48" y="292" font-size="58" font-weight="800" letter-spacing="-2">UNAVAILABLE.</text>
    <rect x="48" y="342" width="1104" height="90" fill="#0e7c66" stroke="#171717" stroke-width="1.5"/>
    <text x="72" y="398" font-size="28" font-weight="800" fill="#fff">ROUTER BYPASSED → NATIVE HERMES SEND CONTINUES</text>
    <text x="48" y="492" font-size="18">Bounded retry first. Visible bypass second. The message is never swallowed.</text>
    <text x="48" y="535" font-size="18">Verified by capability retry tests and compiled-plugin smoke checks.</text>`, 'FAIL-OPEN SENDS · ROUTER IS AN ENHANCEMENT, NOT A SINGLE POINT OF FAILURE')
  }
]

const gif = GIFEncoder()
for (const frame of frames) {
  const { data, info } = await sharp(Buffer.from(frame.svg)).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const palette = quantize(data, 64)
  const index = applyPalette(data, palette)
  gif.writeFrame(index, info.width, info.height, { palette, delay: frame.delay, repeat: 0 })
}
gif.finish()
await writeFile(output, gif.bytes())
console.log(`Rendered ${output} (${frames.length} frames)`)
