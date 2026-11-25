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
    step: '01 · 简单请求',
    message: '你好',
    context: '新会话 · 当前 Sol Medium',
    decision: routeMessage({ text: '你好', mode: 'auto', policy: codexLunaSolPolicy, state: base })
  },
  {
    step: '02 · 技术问题',
    message: 'Analyze the root cause of this TypeScript API error',
    context: '8k context · 当前 Sol Medium',
    decision: routeMessage({ text: 'Analyze the root cause of this TypeScript API error', mode: 'auto', policy: codexLunaSolPolicy, state: base, estimatedContextTokens: 8000 })
  },
  {
    step: '03 · 明确要求更好的模型',
    message: 'Use the best model for the final architecture review',
    context: '16k context · 当前 Sol Medium',
    decision: routeMessage({ text: 'Use the best model for the final architecture review', mode: 'auto', policy: codexLunaSolPolicy, state: base, estimatedContextTokens: 16000 })
  },
  {
    step: '04 · 长上下文',
    message: '把这个标题改短一点',
    context: '36 万 token · 当前 Sol High',
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
const colors = { fast: '#8fa396', balanced: '#244536', strong: '#315e4b', premium: '#b79b4e' }
const face = `Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'WenQuanYi Micro Hei', sans-serif`

function shell(inner, footer = '本地回放 · 不发送分类请求') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="1200" height="675" fill="#f7f5ec"/>
  <g font-family="${face}" fill="#244536">
    <line x1="48" y1="40" x2="1152" y2="40" stroke="#ccd7c6"/>
    <text x="48" y="76" font-size="15" font-weight="600">Hermes Turn Router · auto</text>
    <text x="1152" y="76" text-anchor="end" font-size="13" fill="#617768">逐轮边界</text>
    ${inner}
    <line x1="48" y1="618" x2="1152" y2="618" stroke="#ccd7c6"/>
    <text x="48" y="652" font-size="13" fill="#617768">${footer}</text>
  </g>
</svg>`
}

const frames = [
  {
    delay: 1300,
    svg: shell(`<text x="48" y="210" font-size="40" font-weight="600">同一会话，四次选择</text>
    <text x="48" y="268" font-size="40" font-weight="600">每一轮只用一个模型</text>
    <text x="48" y="340" font-size="18" fill="#617768">自动模式在每条用户消息上重新评估。</text>
    <text x="48" y="378" font-size="18" fill="#617768">队列和重试会守住已经选好的 target。</text>
    <text x="48" y="416" font-size="18" fill="#617768">生成回答的过程中不会中途换模型。</text>`)
  },
  ...scenarios.map(({ step, message, context, decision }, index) => {
    const target = decision.target
    const color = colors[target.id] ?? '#171717'
    const score = Number.isFinite(decision.score) ? decision.score : '∞'
    const reasons = decision.reasons.join(' · ')
    const cache = decision.cacheRisk.toUpperCase()
    return {
      delay: index === scenarios.length - 1 ? 2100 : 1700,
      svg: shell(`<text x="48" y="128" font-size="14" font-weight="600">${escape(step)}</text>
      <rect x="48" y="150" width="700" height="150" fill="#fffefa" stroke="#ccd7c6"/>
      <text x="72" y="184" font-size="12" fill="#617768">用户消息</text>
      <text x="72" y="226" font-size="22" font-weight="600">${escape(message)}</text>
      <text x="72" y="268" font-size="14" fill="#617768">${escape(context)}</text>
      <rect x="772" y="150" width="380" height="150" fill="#fffefa" stroke="#ccd7c6"/>
      <rect x="772" y="150" width="4" height="150" fill="${color}"/>
      <text x="796" y="184" font-size="12" fill="#617768">选中的 target</text>
      <text x="796" y="226" font-size="24" font-weight="600">${escape(target.label)}</text>
      <text x="796" y="268" font-size="14" fill="#617768">score ${score} · ${decision.switched ? 'switch' : 'no switch'}</text>
      <text x="48" y="348" font-size="13" font-weight="600">决策记录</text>
      <line x1="48" y1="366" x2="1152" y2="366" stroke="#ccd7c6"/>
      <text x="48" y="412" font-size="15" fill="#617768">raw target</text><text x="220" y="412" font-size="16" font-weight="600">${escape(decision.rawTierId)}</text>
      <text x="48" y="458" font-size="15" fill="#617768">reason</text><text x="220" y="458" font-size="16" font-weight="600">${escape(reasons)}</text>
      <text x="48" y="504" font-size="15" fill="#617768">cache risk</text><text x="220" y="504" font-size="16" font-weight="600">${cache.toLowerCase()}</text>
      <text x="48" y="550" font-size="15" fill="#617768">lifecycle</text><text x="220" y="550" font-size="16" font-weight="600">reserved → accepted → completed</text>`)
    }
  }),
  {
    delay: 1900,
    svg: shell(`<text x="48" y="132" font-size="14" font-weight="600">05 · 失败边界</text>
    <text x="48" y="210" font-size="36" font-weight="600">Gateway 暂时没有给出可用能力</text>
    <rect x="48" y="250" width="1104" height="96" fill="#fffefa" stroke="#ccd7c6"/>
    <rect x="48" y="250" width="4" height="96" fill="#315e4b"/>
    <text x="72" y="292" font-size="20" font-weight="600">路由旁路。Hermes 仍按原来的方式发送。</text>
    <text x="72" y="322" font-size="15" fill="#617768">router bypassed · native send continues</text>
    <text x="48" y="404" font-size="18" fill="#617768">先做有限次重试，再走看得见的旁路。这条消息不会被吞掉。</text>
    <text x="48" y="444" font-size="16" fill="#617768">能力重试测试和编译后的插件检查都覆盖了这条边界。</text>`, '失败时放行 · 路由器是增强，不是唯一出路')
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
