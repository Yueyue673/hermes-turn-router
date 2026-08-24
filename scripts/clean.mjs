import { readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
await rm(new URL('../dist', import.meta.url), { force: true, recursive: true })

async function cleanPythonCaches(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') {
        await rm(path, { force: true, recursive: true })
      } else if (entry.name !== 'node_modules' && entry.name !== '.git') {
        await cleanPythonCaches(path)
      }
    } else if (/\.py[co]$/.test(entry.name)) {
      await rm(path, { force: true })
    }
  }
}

await cleanPythonCaches(root)
