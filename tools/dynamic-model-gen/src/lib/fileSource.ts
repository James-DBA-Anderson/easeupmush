export type ModelExt = 'glb' | 'gltf' | 'obj'

export type ImportSource = {
  name: string
  ext: ModelExt
  handle: FileSystemFileHandle
}

export type ImportBundle = {
  file: File
  extras: File[]
  source: ImportSource | null
}

type WritableFile = {
  write: (data: BufferSource | Blob | string) => Promise<void>
  close: () => Promise<void>
}

type HandlePerm = FileSystemFileHandle & {
  queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  createWritable: () => Promise<WritableFile>
}

type DropItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
  webkitGetAsEntry?: () => FileSystemEntry | null
}

type FsFileEntry = FileSystemEntry & {
  file: (ok: (file: File) => void, err?: (error: Error) => void) => void
}

type FsDirEntry = FileSystemEntry & {
  createReader: () => {
    readEntries: (ok: (entries: FileSystemEntry[]) => void, err?: (error: Error) => void) => void
  }
}

export function extOf(name: string): ModelExt | 'json' | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.glb')) return 'glb'
  if (lower.endsWith('.gltf')) return 'gltf'
  if (lower.endsWith('.obj')) return 'obj'
  if (lower.endsWith('.json')) return 'json'
  return null
}

export function isSidecar(name: string): boolean {
  return /\.(mtl|bin|png|jpe?g|webp|bmp|gif|ktx2|basis)$/i.test(name)
}

export async function sniffModel(file: File): Promise<'glb' | 'gltf' | 'obj' | 'json' | null> {
  const named = extOf(file.name)
  if (named) return named
  const head = new Uint8Array(await file.slice(0, 80).arrayBuffer())
  if (head.length >= 4 && head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46) {
    return 'glb'
  }
  const text = new TextDecoder().decode(head).replace(/^\uFEFF/, '').trimStart()
  if (text.startsWith('{')) {
    if (/"asset"\s*:/.test(text) || /"scenes"\s*:/.test(text)) return 'gltf'
    return 'json'
  }
  if (text.startsWith('v ') || text.startsWith('o ') || text.startsWith('mtllib') || text.startsWith('#')) {
    return 'obj'
  }
  return null
}

export async function bundleFromFiles(
  files: File[],
  source: ImportSource | null = null,
): Promise<ImportBundle> {
  if (!files.length) throw new Error('No files to import')
  const sniffed = await Promise.all(files.map(async (file) => ({ file, kind: await sniffModel(file) })))
  const mesh = sniffed.find((item) => item.kind && item.kind !== 'json') ?? sniffed.find((item) => item.kind)
  if (!mesh?.kind) throw new Error('Use a GLB, GLTF, OBJ, or Meshbench JSON file')
  const extras = files.filter((file) => file !== mesh.file)
  const nextSource =
    source && source.ext === mesh.kind
      ? source
      : mesh.kind === 'json'
        ? null
        : source
  return { file: mesh.file, extras, source: nextSource }
}

export async function bundleFromDrop(transfer: DataTransfer): Promise<ImportBundle | null> {
  const files = await filesFromDrop(transfer)
  if (!files.length) return null
  let source: ImportSource | null = null
  const item = transfer.items[0] as DropItem | undefined
  if (item?.getAsFileSystemHandle) {
    const handle = await item.getAsFileSystemHandle()
    if (handle && handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const kind = await sniffModel(file)
      if (kind && kind !== 'json') {
        source = { name: file.name || `model.${kind}`, ext: kind, handle: fileHandle }
      }
    }
  }
  return bundleFromFiles(files, source)
}

export async function overwriteOriginal(source: ImportSource, blob: Blob): Promise<void> {
  const handle = source.handle as HandlePerm
  const query = handle.queryPermission
  const request = handle.requestPermission
  const current = query ? await query.call(handle, { mode: 'readwrite' }) : 'prompt'
  if (current !== 'granted') {
    const next = request ? await request.call(handle, { mode: 'readwrite' }) : 'denied'
    if (next !== 'granted') throw new Error('Permission to overwrite that file was denied')
  }
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const items = [...transfer.items] as DropItem[]
  const fromEntries: File[] = []
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      await walkEntry(entry, fromEntries)
    }
  }
  if (fromEntries.length) return dedupeFiles(fromEntries)
  if (items[0]?.getAsFileSystemHandle) {
    const handled: File[] = []
    for (const item of items) {
      const handle = await item.getAsFileSystemHandle?.()
      if (!handle) continue
      await walkHandle(handle, handled)
    }
    if (handled.length) return dedupeFiles(handled)
  }
  return [...transfer.files]
}

async function walkHandle(handle: FileSystemHandle, into: File[]): Promise<void> {
  if (handle.kind === 'file') {
    into.push(await (handle as FileSystemFileHandle).getFile())
    return
  }
  const dir = handle as FileSystemDirectoryHandle & {
    values?: () => AsyncIterable<FileSystemHandle>
  }
  if (!dir.values) return
  for await (const child of dir.values()) {
    await walkHandle(child, into)
  }
}

async function walkEntry(entry: FileSystemEntry, into: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FsFileEntry).file(resolve, reject)
    })
    into.push(file)
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FsDirEntry).createReader()
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (!batch.length) break
    for (const child of batch) await walkEntry(child, into)
  }
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}
