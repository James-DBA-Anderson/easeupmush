import type { SceneNodeInfo } from './spec'

export type OutlinerRow = SceneNodeInfo & { depth: number }

export function outlinerRows(nodes: SceneNodeInfo[]): OutlinerRow[] {
  const byParent = new Map<string | undefined, SceneNodeInfo[]>()
  for (const node of nodes) {
    const key = node.parent
    const list = byParent.get(key) ?? []
    list.push(node)
    byParent.set(key, list)
  }
  const rows: OutlinerRow[] = []
  const walk = (parent: string | undefined, depth: number, trail: Set<string>) => {
    for (const node of byParent.get(parent) ?? []) {
      if (trail.has(node.id)) continue
      rows.push({ ...node, depth })
      trail.add(node.id)
      walk(node.id, depth + 1, trail)
      trail.delete(node.id)
    }
  }
  walk(undefined, 0, new Set())
  return rows
}
