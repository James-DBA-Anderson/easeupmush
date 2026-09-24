#!/usr/bin/env node
/**
 * CPU Shap-E venv for local text-to-mesh (no NVIDIA required).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const venvPython = resolve(root, '.venv/bin/python')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...opts,
  })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

function which(name) {
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

function pyOk(bin) {
  if (!bin) return false
  const r = spawnSync(bin, [
    '-c',
    'import sys; raise SystemExit(0 if (3,11)<=sys.version_info<(3,14) else 1)',
  ])
  return r.status === 0
}

let uv = which('uv')
if (!uv) {
  const homeUv = resolve(process.env.HOME ?? '', '.local/bin/uv')
  if (existsSync(homeUv)) uv = homeUv
}

let python = ['python3.12', 'python3.11', 'python3'].map(which).find(pyOk)

if (!python && uv) {
  console.log('Installing CPython 3.12 with uv…')
  run(uv, ['python', 'install', '3.12'])
}

if (!existsSync(venvPython)) {
  if (uv) {
    console.log('Creating .venv with Python 3.12…')
    run(uv, ['venv', '--python', '3.12', '.venv'])
  } else if (python) {
    console.log(`Creating .venv with ${python}…`)
    run(python, ['-m', 'venv', '.venv'])
  } else {
    console.error(
      'Need Python 3.11 or 3.12 (not 3.14+). Install python3.12, or uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
    )
    process.exit(1)
  }
}

console.log('Installing CPU PyTorch + Shap-E (Diffusers)…')
const uvBin = uv || which('uv')
if (uvBin) {
  run(uvBin, [
    'pip',
    'install',
    '--python',
    venvPython,
    'torch',
    '--index-url',
    'https://download.pytorch.org/whl/cpu',
  ])
  run(uvBin, ['pip', 'install', '--python', venvPython, '-r', 'requirements.txt'])
} else {
  const pip = resolve(root, '.venv/bin/pip')
  run(venvPython, ['-m', 'ensurepip', '--upgrade'])
  run(venvPython, ['-m', 'pip', 'install', '-U', 'pip'])
  run(venvPython, [
    '-m',
    'pip',
    'install',
    'torch',
    '--index-url',
    'https://download.pytorch.org/whl/cpu',
  ])
  run(pip, ['install', '-r', 'requirements.txt'])
}

console.log('Shap-E CPU worker ready. First generate downloads openai/shap-e (~1.5GB).')
