// Serves the production build the way the container does: the standalone
// server with the static files and public/ copied beside it.
import { spawn } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const standalone = new URL('.next/standalone/', root)
const server = new URL('server.js', standalone)
if (!existsSync(server)) {
  console.error('serve-standalone: no production build found; run pnpm build first')
  process.exit(1)
}
cpSync(new URL('.next/static/', root), new URL('.next/static/', standalone), { recursive: true })
if (existsSync(new URL('public/', root))) cpSync(new URL('public/', root), new URL('public/', standalone), { recursive: true })
const child = spawn(process.execPath, [fileURLToPath(server)], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 0))
