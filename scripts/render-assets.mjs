import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const asset = name => fileURLToPath(new URL(`../assets/${name}`, import.meta.url))

await sharp(asset('social-preview.svg'))
  .resize(1280, 640)
  .png({ compressionLevel: 9 })
  .toFile(asset('social-preview.png'))

for (const name of ['hero.svg', 'architecture.svg', 'decision-demo.svg', 'social-preview.svg']) {
  await sharp(asset(name)).metadata()
  console.log(`validated ${name}`)
}
console.log('rendered social-preview.png')
