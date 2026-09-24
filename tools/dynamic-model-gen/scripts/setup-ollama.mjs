#!/usr/bin/env node
/**
 * Make sure the Ollama daemon and a chat model exist for Meshbench layouts.
 */
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5'

function which(name) {
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

async function tags() {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  return res.json()
}

async function waitForApi(ms = 20_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      await tags()
      return true
    } catch {
      await delay(400)
    }
  }
  return false
}

const bin = which('ollama')
if (!bin) {
  console.error(`Ollama is not on PATH.

User-local install (no sudo):

  curl -fsSL https://ollama.com/download/ollama-linux-amd64.tar.zst | zstd -d | tar -xf - -C "$HOME/.local"

Or the official installer (may need sudo):

  curl -fsSL https://ollama.com/install.sh | sh

Then:

  npm run setup:ollama
`)
  process.exit(1)
}

let up = false
try {
  await tags()
  up = true
} catch {
  console.log('Starting `ollama serve`…')
  const child = spawn(bin, ['serve'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  up = await waitForApi()
}

if (!up) {
  console.error(`Could not reach ${OLLAMA_URL}. Start it with: ollama serve`)
  process.exit(1)
}

console.log(`Pulling ${MODEL} for Meshbench layouts…`)
const pull = spawnSync(bin, ['pull', MODEL], { stdio: 'inherit' })
if (pull.status !== 0) {
  process.exit(pull.status ?? 1)
}

const data = await tags()
const names = (data.models ?? []).map((m) => m.name)
console.log(`Ollama ready at ${OLLAMA_URL}`)
console.log(`Models: ${names.join(', ') || '(none)'}`)
console.log('Meshbench will use this for New model and Edit model.')
