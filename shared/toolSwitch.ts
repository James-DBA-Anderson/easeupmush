export type DevToolId = 'editor' | 'spritebench' | 'meshbench' | 'linebench'

export type DevTool = {
  id: DevToolId
  name: string
  blurb: string
  port: number
  path: string
}

export const DEV_TOOLS: readonly DevTool[] = [
  {
    id: 'editor',
    name: 'Level editor',
    blurb: 'Canoe Lake layout',
    port: 5304,
    path: '/editor.html',
  },
  {
    id: 'spritebench',
    name: 'Spritebench',
    blurb: '2D character sprites',
    port: 5173,
    path: '/',
  },
  {
    id: 'meshbench',
    name: 'Meshbench',
    blurb: '3D models',
    port: 5174,
    path: '/',
  },
  {
    id: 'linebench',
    name: 'Linebench',
    blurb: 'Dialogue recording',
    port: 5175,
    path: '/',
  },
]

const STYLE_ID = 'eum-tool-switch-css'

const CSS = `
.eum-tool-switch-host {
  cursor: pointer;
  user-select: none;
}
.eum-tool-switch-host::after {
  content: "";
  display: inline-block;
  align-self: center;
  flex-shrink: 0;
  width: 0;
  height: 0;
  margin-left: 0.45em;
  vertical-align: 0.15em;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
  opacity: 0.45;
}
.eum-tool-switch-host:focus-visible {
  outline: 2px solid #ffd23a;
  outline-offset: 3px;
  border-radius: 4px;
}
.eum-tool-switch-menu {
  position: fixed;
  z-index: 10000;
  min-width: 240px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(255, 180, 84, 0.45);
  background: #241910;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.65);
  color: #f6eee4;
  font: 13px/1.35 "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
}
.eum-tool-switch-label {
  padding: 6px 10px 8px;
  color: #c4ad96;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.eum-tool-switch-item {
  display: grid;
  width: 100%;
  gap: 1px;
  margin: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.eum-tool-switch-item:hover,
.eum-tool-switch-item:focus-visible {
  background: rgba(255, 180, 84, 0.14);
  outline: none;
}
.eum-tool-switch-item strong {
  font-weight: 700;
  letter-spacing: -0.01em;
}
.eum-tool-switch-item span {
  color: #c4ad96;
  font-size: 12px;
}
`

function ensureCss(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function toolUrl(tool: DevTool): string {
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${tool.port}${tool.path}`
}

/** Click the top-left brand / title to open another local tool in a new tab. */
export function mountToolSwitch(
  host: HTMLElement,
  current: DevToolId,
): () => void {
  ensureCss()
  host.classList.add('eum-tool-switch-host')
  if (!host.hasAttribute('tabindex')) host.tabIndex = 0
  if (!host.getAttribute('role')) host.setAttribute('role', 'button')
  host.setAttribute('aria-haspopup', 'menu')
  host.setAttribute('aria-expanded', 'false')
  if (!host.getAttribute('aria-label') && !host.innerText.trim()) {
    host.setAttribute('aria-label', 'Open another tool')
  }
  host.title = host.title || 'Other tools'

  let menu: HTMLDivElement | null = null

  const close = (): void => {
    menu?.remove()
    menu = null
    host.setAttribute('aria-expanded', 'false')
  }

  const open = (): void => {
    if (menu) return
    const pop = document.createElement('div')
    pop.className = 'eum-tool-switch-menu'
    pop.setAttribute('role', 'menu')
    pop.setAttribute('aria-label', 'Ease Up Mush tools')

    const label = document.createElement('div')
    label.className = 'eum-tool-switch-label'
    label.textContent = 'Open in a new tab'
    pop.appendChild(label)

    for (const tool of DEV_TOOLS) {
      if (tool.id === current) continue
      const item = document.createElement('a')
      item.className = 'eum-tool-switch-item'
      item.href = toolUrl(tool)
      item.target = '_blank'
      item.rel = 'noopener noreferrer'
      item.setAttribute('role', 'menuitem')
      const name = document.createElement('strong')
      name.textContent = tool.name
      const blurb = document.createElement('span')
      blurb.textContent = tool.blurb
      item.append(name, blurb)
      item.addEventListener('click', () => {
        close()
      })
      pop.appendChild(item)
    }

    document.body.appendChild(pop)
    menu = pop
    host.setAttribute('aria-expanded', 'true')

    const rect = host.getBoundingClientRect()
    const left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)
    pop.style.top = `${Math.round(rect.bottom + 8)}px`
    pop.style.left = `${Math.round(Math.max(8, left))}px`
  }

  const toggle = (ev: Event): void => {
    ev.preventDefault()
    ev.stopPropagation()
    if (menu) close()
    else open()
  }

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (ev.target !== host) return
      ev.preventDefault()
      toggle(ev)
    }
    if (ev.key === 'Escape' && menu) {
      ev.preventDefault()
      close()
      host.focus()
    }
  }

  const onDoc = (ev: PointerEvent): void => {
    if (!menu) return
    const target = ev.target
    if (!(target instanceof Node)) return
    if (host.contains(target) || menu.contains(target)) return
    close()
  }

  host.addEventListener('click', toggle)
  host.addEventListener('keydown', onKey)
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onDoc, true)

  return () => {
    close()
    host.removeEventListener('click', toggle)
    host.removeEventListener('keydown', onKey)
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onDoc, true)
    host.classList.remove('eum-tool-switch-host')
  }
}
