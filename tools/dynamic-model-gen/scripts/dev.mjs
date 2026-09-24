import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import concurrently from 'concurrently'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'

function which(name) {
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

async function ollamaUp() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(800) })
    return res.ok
  } catch {
    return false
  }
}

const ollamaBin = which('ollama')
if (ollamaBin && !(await ollamaUp())) {
  console.log('Starting Ollama…')
  const child = spawn(ollamaBin, ['serve'], { detached: true, stdio: 'ignore' })
  child.unref()
} else if (!ollamaBin) {
  console.log('Ollama not on PATH — kit still works. Run `npm run setup:ollama` after installing Ollama.')
}

const commands = [
  { name: 'api', command: 'npm run dev:api', prefixColor: 'yellow' },
  { name: 'web', command: 'npm run dev:web', prefixColor: 'green' },
]

if (existsSync('.venv/bin/python')) {
  commands.push({
    name: '3d',
    command: '.venv/bin/python server/shap_e_worker.py',
    prefixColor: 'magenta',
  })
} else {
  console.log(
    'Shap-E venv missing — kit + Ollama still work. Run `npm run setup:models` from the repo root for neural meshes.',
  )
}

const { result } = concurrently(commands, { killOthersOn: ['failure'] })
await result
