// Serves the production build the way the container does: the standalone
// server with the static files and public/ copied beside it.
import { spawn } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import { constants } from 'node:os'
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
// A server ended by a signal exits as a shell reports it, 128 plus the signal's number, as scripts/start.ts does.
child.on('exit', (code, signal) => process.exit(code ?? 128 + (signal ? constants.signals[signal] : 0)))
