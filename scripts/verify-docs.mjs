import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve('.')
const skipped = new Set(['.git', 'node_modules', 'dist'])

async function markdownFiles(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await markdownFiles(path))
    else if (entry.name.endsWith('.md')) output.push(path)
  }
  return output
}

const missing = []
const replacement = []
for (const file of await markdownFiles(root)) {
  const text = await readFile(file, 'utf8')
  if (text.includes('\uFFFD')) replacement.push(file)
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue
    target = target.split('#', 1)[0].split('?', 1)[0]
    if (!target) continue
    const resolved = resolve(dirname(file), decodeURIComponent(target))
    try {
      await stat(resolved)
    } catch {
      missing.push(`${file.slice(root.length + 1)} -> ${target}`)
    }
  }
}

if (missing.length) throw new Error(`Broken relative links:\n${missing.join('\n')}`)
if (replacement.length) throw new Error(`Unicode replacement characters in:\n${replacement.join('\n')}`)

for (const name of ['hero.svg', 'architecture.svg', 'decision-demo.svg', 'reference-evaluation.svg', 'social-preview.svg']) {
  const metadata = await sharp(join(root, 'assets', name)).metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Unreadable asset: ${name}`)
}
const preview = await sharp(join(root, 'assets', 'social-preview.png')).metadata()
if (preview.width !== 1280 || preview.height !== 640) {
  throw new Error(`social-preview.png must be 1280x640, got ${preview.width}x${preview.height}`)
}
const demo = await sharp(join(root, 'assets', 'turn-routing-demo.gif'), { animated: true }).metadata()
if (demo.width !== 1200 || demo.pageHeight !== 675 || demo.pages !== 6) {
  throw new Error(`turn-routing-demo.gif must be 1200x675 with 6 frames, got ${demo.width}x${demo.pageHeight} with ${demo.pages} frames`)
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const readme = await readFile(join(root, 'README.md'), 'utf8')
const zh = await readFile(join(root, 'README.zh-CN.md'), 'utf8')
for (const [name, text] of [['README.md', readme], ['README.zh-CN.md', zh]]) {
  if (!text.includes(pkg.version)) {
    throw new Error(`${name} does not mention package version ${pkg.version}`)
  }
  for (const target of ['fast', 'balanced', 'strong', 'premium']) {
    if (!text.includes(`\`${target}\``)) throw new Error(`${name} is missing target ${target}`)
  }
}

console.log('Documentation and asset checks passed')
