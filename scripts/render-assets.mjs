import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = fileURLToPath(new URL('../assets/variants/', import.meta.url))
const output = fileURLToPath(new URL('../assets/rendered/', import.meta.url))
await mkdir(output, { recursive: true })
for (const name of await readdir(source)) {
  if (!name.endsWith('.svg')) continue
  const target = name.replace(/\.svg$/, '.png')
  await sharp(join(source, name)).resize(1280, 640).png().toFile(join(output, target))
  console.log(target)
}
