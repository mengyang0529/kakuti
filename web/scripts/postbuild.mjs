import { copyFile } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const src = path.join(distDir, 'index.html')
const dest = path.join(distDir, '404.html')

try {
  await stat(src)
} catch (error) {
  console.error('postbuild: dist/index.html not found; skipping 404 copy')
  process.exit(0)
}

try {
  await copyFile(src, dest)
  console.log('postbuild: copied index.html → 404.html')
} catch (error) {
  console.error('postbuild: failed to copy index.html → 404.html', error)
  process.exitCode = 1
}
