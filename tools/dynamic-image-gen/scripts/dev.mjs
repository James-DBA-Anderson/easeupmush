import { existsSync } from 'node:fs'
import concurrently from 'concurrently'

const commands = [
  { name: 'api', command: 'npm run dev:api', prefixColor: 'teal' },
  { name: 'web', command: 'npm run dev:web', prefixColor: 'green' },
]

if (existsSync('.venv/bin/python')) {
  commands.push({
    name: 'img',
    command: '.venv/bin/python server/diffusers_worker.py',
    prefixColor: 'magenta',
  })
} else {
  console.log(
    'Diffusers venv missing — skipping CPU worker. Run `npm run setup:assets` from the repo root if you need it.',
  )
}

const { result } = concurrently(commands, { killOthersOn: ['failure'] })
await result
