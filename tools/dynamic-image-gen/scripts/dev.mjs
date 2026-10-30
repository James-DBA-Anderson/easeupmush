import { existsSync } from 'node:fs'
import net from 'node:net'
import concurrently from 'concurrently'

const WEB = Number(process.env.PORT_WEB ?? 5173)
const API = Number(process.env.PORT ?? 8787)

function listening(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' }, () => {
      s.end()
      resolve(true)
    })
    s.setTimeout(400)
    s.on('timeout', () => {
      s.destroy()
      resolve(false)
    })
    s.on('error', () => resolve(false))
  })
}

function printUrls() {
  console.log(`  App: http://localhost:${WEB}`)
  console.log(`  API: http://localhost:${API}`)
}

if ((await listening(WEB)) && (await listening(API))) {
  console.log('Spritebench is already running.')
  printUrls()
  process.exit(0)
}

const commands = [
  { name: 'api', command: 'npm run dev:api', prefixColor: 'teal' },
  { name: 'web', command: 'npm run dev:web', prefixColor: 'green' },
]

if (existsSync('.venv/bin/python')) {
  commands.push({
    name: 'img',
    // Optional CPU worker — a crash must not take down the UI.
    command: "sh -c '.venv/bin/python server/diffusers_worker.py; exit 0'",
    prefixColor: 'magenta',
  })
} else {
  console.log(
    'Diffusers venv missing — skipping CPU worker. Run `npm run setup:assets` from the repo root if you need it.',
  )
}

console.log('Starting Spritebench…')
printUrls()

const { result } = concurrently(commands, { killOthersOn: ['failure'] })
try {
  await result
} catch (err) {
  const events = Array.isArray(err) ? err : [err]
  const fails = events.filter((e) => {
    const code = e?.exitCode
    if (code === 0 || code === 'SIGTERM' || code === 143) return false
    if (e?.killed) return false
    return code !== undefined && code !== null
  })
  if (!fails.length) process.exit(1)
  for (const e of fails) {
    const name = e.command?.name ?? 'process'
    console.error(`[${name}] exited ${e.exitCode}`)
  }
  process.exit(1)
}
