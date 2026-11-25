import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { codexLunaSolPolicy, replayPolicy } from '../dist/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixturePath = `${root}examples/reference-evaluation.ndjson`
const reportPath = `${root}docs/reference-evaluation.md`
const chartPath = `${root}assets/reference-evaluation.svg`
const fixtureText = await readFile(fixturePath, 'utf8')
const events = fixtureText.split(/\r?\n/).filter(Boolean).map(JSON.parse)
const summary = replayPolicy(codexLunaSolPolicy, events)
const fixtureHash = createHash('sha256').update(fixtureText).digest('hex').slice(0, 12)

const pct = value => value == null ? '—' : `${(value * 100).toFixed(value === 1 ? 0 : 1)}%`
const categoryRows = Object.entries(summary.byCategory)
  .map(([name, value]) => `| \`${name}\` | ${value.events} | ${value.expectationMatches}/${value.expectationChecks} | ${pct(value.expectationAccuracy)} |`)
  .join('\n')
const targetRows = Object.entries(summary.byTarget)
  .map(([name, value]) => `| \`${name}\` | ${value} | ${pct(value / summary.routedEvents)} |`)
  .join('\n')

const report = `# Reference policy evaluation

This report is generated from [\`examples/reference-evaluation.ndjson\`](../examples/reference-evaluation.ndjson) using the bundled Codex Luna/Sol policy.

> [!NOTE]
> This is a deterministic behavior contract for the router, not a benchmark of model quality, provider latency, or real-world accuracy. Fixtures are public, anonymized, and intentionally selected to cover policy boundaries.

## Result

| Metric | Value |
|---|---:|
| Fixture events | ${summary.totalEvents} |
| Routed / bypassed | ${summary.routedEvents} / ${summary.bypassedEvents} |
| Expected decisions checked | ${summary.expectationChecks} |
| Expected decisions matched | ${summary.expectationMatches} |
| Expectation accuracy | ${pct(summary.expectationAccuracy)} |
| Routing errors | ${summary.errors} |
| Model switches | ${summary.switches} |
| Switch rate | ${pct(summary.switchRate)} |
| Fixture SHA-256 prefix | \`${fixtureHash}\` |

![Reference target distribution](../assets/reference-evaluation.svg)

## Coverage by category

| Category | Events | Matches | Accuracy |
|---|---:|---:|---:|
${categoryRows}

## Target distribution

| Target | Turns | Share of routed turns |
|---|---:|---:|
${targetRows}

## What the fixture covers

- short Chinese and English requests;
- technical/code messages and attachments;
- architecture and multi-constraint reasoning;
- production, database, permission, backup, and rollback safety floors;
- explicit quality and saving language;
- \`auto\`, \`save\`, \`quality\`, \`fixed\`, \`off\`, and one-shot behavior;
- continuation affinity;
- long-context cache affinity and safety upgrades;
- server allowlists;
- observed usage aggregation without prompt echoing.

## Reproduce

\`\`\`bash
npm ci
npm run build
node dist/cli.js replay --input examples/reference-evaluation.ndjson
\`\`\`

Regenerate this report and chart:

\`\`\`bash
npm run evaluate:reference
\`\`\`

CI runs the generator in \`--check\` mode and fails when policy behavior changes without an updated report. A threshold change must therefore update tests, fixtures, and this generated evidence in the same commit.
`

const colors = { fast: '#8fa396', balanced: '#244536', strong: '#315e4b', premium: '#b79b4e' }
const targets = ['fast', 'balanced', 'strong', 'premium']
const max = Math.max(...targets.map(name => summary.byTarget[name] ?? 0), 1)
const bars = targets.map((name, index) => {
  const value = summary.byTarget[name] ?? 0
  const width = Math.round(690 * value / max)
  const y = 190 + index * 82
  return `  <text x="70" y="${y + 22}" font-size="15" font-weight="600">${name}</text>\n  <rect x="210" y="${y}" width="${width}" height="32" fill="${colors[name]}"/>\n  <text x="${Math.max(230 + width, 930)}" y="${y + 22}" font-size="16" font-weight="600">${value}</text>`
}).join('\n')
const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600" role="img" aria-labelledby="title desc">
<title id="title">Reference policy target distribution</title>
<desc id="desc">${summary.routedEvents} routed fixtures across fast, balanced, strong, and premium targets</desc>
<rect width="1200" height="600" fill="#f7f5ec"/>
<g font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'WenQuanYi Micro Hei', sans-serif" fill="#244536">
  <line x1="52" y1="42" x2="1148" y2="42" stroke="#ccd7c6"/>
  <text x="52" y="78" font-size="14" font-weight="600">参考策略 · 生成的对照</text>
  <text x="1148" y="78" text-anchor="end" font-size="13" fill="#617768">fixture ${fixtureHash}</text>
  <text x="52" y="128" font-size="28" font-weight="600">Target distribution</text>
${bars}
  <line x1="52" y1="535" x2="1148" y2="535" stroke="#ccd7c6"/>
  <text x="52" y="568" font-size="13" fill="#617768">${summary.expectationMatches}/${summary.expectationChecks} 条期望决策一致</text>
  <text x="1148" y="568" text-anchor="end" font-size="13" fill="#617768">行为约定 · 不是模型基准</text>
</g>
</svg>
`

const check = process.argv.includes('--check')
if (check) {
  const [existingReport, existingChart] = await Promise.all([
    readFile(reportPath, 'utf8'),
    readFile(chartPath, 'utf8')
  ])
  if (existingReport !== report || existingChart !== chart) {
    console.error('Reference evaluation artifacts are stale. Run npm run evaluate:reference.')
    process.exit(1)
  }
  console.log(`Reference evaluation verified: ${summary.expectationMatches}/${summary.expectationChecks} matches`)
} else {
  await Promise.all([
    writeFile(reportPath, report),
    writeFile(chartPath, chart)
  ])
  console.log(`Reference evaluation generated: ${summary.expectationMatches}/${summary.expectationChecks} matches`)
}
