import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { buildGroupFromSpec, meshFromPart, partHandle } from '../lib/buildMesh'
import {
  DEFAULT_KNIFE_SIZE,
  makeKnifeGeometry,
  planeFromPoints,
  splitIslands,
  splitMeshByPlane,
  type CutLoopInfo,
  type KnifeShape,
  type KnifeSize,
} from '../lib/cutMesh'
import type { ModelExt } from '../lib/fileSource'
import { sniffModel } from '../lib/fileSource'
import type { ModelPart, ModelSpec, PartShape } from '../lib/spec'
import { PART_SHAPE_LABELS, PART_SHAPES } from '../lib/spec'
import {
  clipDuration,
  lerpPose,
  type AnimKey,
  type AnimPoseMesh,
  type ClipInfo,
} from '../lib/anim'

export type EditorTool = 'orbit' | 'translate' | 'rotate' | 'scale' | 'points' | 'inflate' | 'smooth' | 'cut'

type VertPick = {
  mesh: THREE.Mesh
  indices: number[]
  world: THREE.Vector3
}

const NODE_CLOUD_MAX = 900
const NODE_POOL_MAX = 5_000
const NODE_FRONT_RGB = [0.48, 0.843, 1] as const

type ViewportProps = {
  sourceKey: string
  sceneRev: number
  spec: ModelSpec | null
  glbUrl: string | null
  editing: boolean
  tool: EditorTool
  selectedPartId: string | null
  brushRadius: number
  brushStrength: number
  onSelectPart: (id: string | null) => void
  onParts?: (parts: { id: string; label: string }[]) => void
  onCheckpoint?: () => void
  onHistoryChange?: (state: { undo: boolean; redo: boolean }) => void
  onClipChange?: (clip: ClipInfo) => void
  onCutLoopChange?: (loop: CutLoopInfo) => void
  onReady?: (api: ViewportApi) => void
  showTextures?: boolean
}

export type ViewportApi = {
  exportGlb: () => Promise<Blob>
  exportAs: (ext: ModelExt) => Promise<Blob>
  capturePng: () => string
  captureSpec: (base?: ModelSpec | null) => ModelSpec | null
  ground: () => void
  recenter: () => void
  loadFile: (files: File | File[]) => Promise<{ spec?: ModelSpec; hasTextures: boolean }>
  setShowTextures: (on: boolean) => void
  setKnife: (opts: { shape: KnifeShape; size: KnifeSize; gizmo: 'translate' | 'rotate' | 'scale' }) => void
  cut: () => { pieces: { id: string; label: string }[]; split: boolean }
  clearCutLoop: () => CutLoopInfo
  undoCutNode: () => CutLoopInfo
  getCutLoop: () => CutLoopInfo
  setPartLabels: (labels: { id: string; label: string }[]) => void
  addShape: (shape: PartShape, color?: string) => { id: string; label: string }
  updatePart: (id: string, patch: { color?: string; roughness?: number; metalness?: number }) => void
  pushHistory: () => void
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  addAnimFrame: () => ClipInfo
  updateAnimFrame: () => ClipInfo
  deleteAnimFrame: (id: string) => ClipInfo
  selectAnimFrame: (id: string) => ClipInfo
  setAnimPlayhead: (time: number) => ClipInfo
  playAnim: () => ClipInfo
  pauseAnim: () => ClipInfo
  getClip: () => ClipInfo
  exportAnimatedGlb: () => Promise<Blob>
}

export function Viewport({
  sourceKey: _sourceKey,
  sceneRev,
  spec,
  glbUrl,
  editing,
  tool,
  selectedPartId,
  brushRadius,
  brushStrength,
  onSelectPart,
  onParts,
  onCheckpoint,
  onHistoryChange,
  onClipChange,
  onCutLoopChange,
  onReady,
  showTextures = false,
}: ViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<ViewportHandle | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const handle = new ViewportHandle(mount, onSelectPart, onParts)
    handle.setHistoryHooks(onCheckpoint, onHistoryChange)
    handle.setClipHook(onClipChange)
    handle.setCutLoopHook(onCutLoopChange)
    apiRef.current = handle
    onReady?.({
      exportGlb: () => handle.exportGlb(),
      exportAs: (ext) => handle.exportAs(ext),
      capturePng: () => handle.capturePng(),
      captureSpec: (base) => handle.captureSpec(base),
      ground: () => handle.ground(),
      recenter: () => handle.recenter(),
      loadFile: (files) => handle.loadFile(files),
      setShowTextures: (on) => handle.setShowTextures(on),
      setKnife: (opts) => handle.setKnife(opts),
      cut: () => handle.cut(),
      clearCutLoop: () => handle.clearCutLoop(),
      undoCutNode: () => handle.undoCutNode(),
      getCutLoop: () => handle.getCutLoop(),
      setPartLabels: (labels) => handle.setPartLabels(labels),
      addShape: (shape, color) => handle.addShape(shape, color),
      updatePart: (id, patch) => handle.updatePart(id, patch),
      pushHistory: () => handle.pushHistory(),
      undo: () => handle.undo(),
      redo: () => handle.redo(),
      canUndo: () => handle.canUndo(),
      canRedo: () => handle.canRedo(),
      addAnimFrame: () => handle.addAnimFrame(),
      updateAnimFrame: () => handle.updateAnimFrame(),
      deleteAnimFrame: (id) => handle.deleteAnimFrame(id),
      selectAnimFrame: (id) => handle.selectAnimFrame(id),
      setAnimPlayhead: (time) => handle.setAnimPlayhead(time),
      playAnim: () => handle.playAnim(),
      pauseAnim: () => handle.pauseAnim(),
      getClip: () => handle.getClip(),
      exportAnimatedGlb: () => handle.exportAnimatedGlb(),
    })
    return () => {
      handle.dispose()
      apiRef.current = null
    }
  }, [onSelectPart, onParts, onReady])

  useEffect(() => {
    apiRef.current?.setHistoryHooks(onCheckpoint, onHistoryChange)
  }, [onCheckpoint, onHistoryChange])

  useEffect(() => {
    apiRef.current?.setClipHook(onClipChange)
  }, [onClipChange])

  useEffect(() => {
    apiRef.current?.setCutLoopHook(onCutLoopChange)
  }, [onCutLoopChange])

  useEffect(() => {
    apiRef.current?.setCutLoopHook(onCutLoopChange)
  }, [onCutLoopChange])

  useEffect(() => {
    if (!spec && !glbUrl) return
    void apiRef.current?.show({ spec, glbUrl })
  }, [sceneRev])

  useEffect(() => {
    apiRef.current?.setEditing(tool)
  }, [editing, tool])

  useEffect(() => {
    apiRef.current?.setBrush(brushRadius, brushStrength)
  }, [brushRadius, brushStrength])

  useEffect(() => {
    apiRef.current?.highlight(selectedPartId)
  }, [selectedPartId])

  useEffect(() => {
    apiRef.current?.setShowTextures(showTextures)
  }, [showTextures])

  return <div className="viewport-canvas" ref={mountRef} />
}

class ViewportHandle {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private orbit: OrbitControls
  private transform: TransformControls
  private modelRoot = new THREE.Group()
  private grid: THREE.GridHelper
  private brushCursor: THREE.Mesh
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private frame = 0
  private disposed = false
  private sculpting = false
  private tool: EditorTool = 'orbit'
  private brushRadius = 0.32
  private brushStrength = 0.7
  private world = new THREE.Vector3()
  private local = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private nrm = new THREE.Vector3()
  private inv = new THREE.Matrix4()
  private sculptTarget: THREE.Mesh | null = null
  private selectedId: string | null = null
  private nodeHover: VertPick | null = null
  private nodeSel: VertPick | null = null
  private nodeAnchor = new THREE.Object3D()
  private nodeMarker: THREE.Mesh
  private nodeCloud: THREE.Points
  private nodeShadeNrms: number[][] = []
  private nodeShadeMesh: THREE.Mesh[] = []
  private nodeShadeIndex: number[] = []
  private nodePool: {
    wx: number
    wy: number
    wz: number
    nrms: number[]
    mesh: THREE.Mesh
    index: number
  }[] = []
  private knife: THREE.Mesh
  private knifeShape: KnifeShape = 'plane'
  private knifeSize: KnifeSize = { ...DEFAULT_KNIFE_SIZE }
  private knifeGizmo: 'translate' | 'rotate' | 'scale' = 'translate'
  private knifeSeq = 0
  private cutLoop: { world: THREE.Vector3; mesh: THREE.Mesh }[] = []
  private cutClosed = false
  private cutPath: THREE.Line
  private cutDots: THREE.Points
  private cutPlane: THREE.Mesh
  private onCutLoopChange?: (loop: CutLoopInfo) => void
  private mount: HTMLElement
  private onSelectPart: (id: string | null) => void
  private onParts?: (parts: { id: string; label: string }[]) => void
  private onCheckpoint?: () => void
  private onHistoryChange?: (state: { undo: boolean; redo: boolean }) => void
  private onClipChange?: (clip: ClipInfo) => void
  private past: THREE.Group[] = []
  private future: THREE.Group[] = []
  private showTextures = false
  private hasFileTextures = false
  private importUrls: string[] = []
  private animKeys: AnimKey[] = []
  private animPlayhead = 0
  private animPlaying = false
  private animSelected: string | null = null
  private animSeq = 0
  private lastTickMs = 0
  private nodeCamKey = ''

  constructor(
    mount: HTMLElement,
    onSelectPart: (id: string | null) => void,
    onParts?: (parts: { id: string; label: string }[]) => void,
  ) {
    this.mount = mount
    this.onSelectPart = onSelectPart
    this.onParts = onParts
    const w = mount.clientWidth || 640
    const h = mount.clientHeight || 480
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    mount.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, w / Math.max(h, 1), 0.05, 400)
    this.camera.position.set(2.4, 1.8, 3.4)

    this.scene.background = new THREE.Color(0x1c140f)
    this.scene.add(new THREE.HemisphereLight(0xffe6c9, 0x3a2a22, 1.05))
    const key = new THREE.DirectionalLight(0xfff4e6, 1.15)
    key.position.set(3, 6, 4)
    key.castShadow = true
    this.scene.add(key)
    this.scene.add(new THREE.DirectionalLight(0x7ad7ff, 0.35).translateX(-4).translateY(2).translateZ(-2))

    this.grid = new THREE.GridHelper(8, 16, 0x6a5344, 0x3a2c24)
    this.scene.add(this.grid)
    this.scene.add(this.modelRoot)

    this.brushCursor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 16),
      new THREE.MeshBasicMaterial({
        color: 0x7ad7ff,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
      }),
    )
    this.brushCursor.visible = false
    this.brushCursor.renderOrder = 10
    this.scene.add(this.brushCursor)

    this.nodeMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x7ad7ff,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    )
    this.nodeMarker.visible = false
    this.nodeMarker.renderOrder = 12
    this.scene.add(this.nodeMarker)

    this.nodeCloud = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: 8,
        sizeAttenuation: false,
        depthTest: true,
        transparent: true,
        opacity: 0.95,
      }),
    )
    this.nodeCloud.visible = false
    this.nodeCloud.frustumCulled = false
    this.nodeCloud.renderOrder = 11
    this.scene.add(this.nodeCloud)

    this.knife = new THREE.Mesh(
      makeKnifeGeometry('plane', this.knifeSize),
      new THREE.MeshStandardMaterial({
        color: 0xffc44d,
        emissive: 0x5a3a10,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.4,
        metalness: 0.05,
      }),
    )
    this.knife.position.set(0, 0.95, 0)
    this.knife.visible = false
    this.knife.renderOrder = 6
    this.knife.userData.knife = true
    this.refreshKnifeEdges()
    this.scene.add(this.knife)

    this.cutPath = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffb454,
        depthTest: true,
        transparent: true,
        opacity: 0.98,
      }),
    )
    this.cutPath.frustumCulled = false
    this.cutPath.renderOrder = 12
    this.cutPath.visible = false
    this.scene.add(this.cutPath)
    this.cutDots = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xffe066,
        size: 11,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
        opacity: 1,
      }),
    )
    this.cutDots.frustumCulled = false
    this.cutDots.renderOrder = 13
    this.cutDots.visible = false
    this.scene.add(this.cutDots)
    this.cutPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffc14a,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.cutPlane.frustumCulled = false
    this.cutPlane.renderOrder = 11
    this.cutPlane.visible = false
    this.cutPlane.raycast = () => undefined
    this.scene.add(this.cutPlane)

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.target.set(0, 0.7, 0)

    this.transform = new TransformControls(this.camera, this.renderer.domElement)
    this.transform.setSpace('world')
    this.transform.setSize(1.65)
    this.transform.showX = true
    this.transform.showY = true
    this.transform.showZ = true
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value
      if (event.value) this.checkpoint()
      else if (this.tool === 'points' && this.nodeSel) {
        this.nodeSel.mesh.geometry.computeVertexNormals()
        this.refreshNodeOverlay()
      }
    })
    this.transform.addEventListener('objectChange', () => {
      this.onGizmoChange()
    })
    this.nodeAnchor.name = 'node-anchor'
    this.scene.add(this.nodeAnchor)
    this.scene.add(this.transform.getHelper())

    const canvas = this.renderer.domElement
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', this.onPointerDown, true)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('lostpointercapture', this.onPointerUp)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('resize', this.onResize)

    const tick = () => {
      if (this.disposed) return
      this.frame = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = this.lastTickMs ? Math.min(0.08, (now - this.lastTickMs) / 1000) : 0
      this.lastTickMs = now
      this.orbit.update()
      if (this.animPlaying) this.tickAnim(dt)
      if (this.tool === 'points' || this.tool === 'cut') this.updateNodeOverlayView()
      this.updateNodeMarkerScale()
      this.renderer.render(this.scene, this.camera)
    }
    tick()
  }

  public setHistoryHooks(
    onCheckpoint?: () => void,
    onHistoryChange?: (state: { undo: boolean; redo: boolean }) => void,
  ): void {
    this.onCheckpoint = onCheckpoint
    this.onHistoryChange = onHistoryChange
  }

  public setClipHook(onClipChange?: (clip: ClipInfo) => void): void {
    this.onClipChange = onClipChange
    this.emitClip()
  }

  public setCutLoopHook(onCutLoopChange?: (loop: CutLoopInfo) => void): void {
    this.onCutLoopChange = onCutLoopChange
    this.emitCutLoop()
  }

  public canUndo(): boolean {
    return this.past.length > 0
  }

  public canRedo(): boolean {
    return this.future.length > 0
  }

  public pushHistory(): void {
    this.future = []
    this.past.push(deepCloneGroup(this.modelRoot))
    if (this.past.length > 16) {
      const dropped = this.past.shift()
      disposeGroup(dropped)
    }
    this.emitHistory()
  }

  public undo(): boolean {
    if (!this.past.length) return false
    this.future.push(deepCloneGroup(this.modelRoot))
    if (this.future.length > 16) {
      const dropped = this.future.shift()
      disposeGroup(dropped)
    }
    const prev = this.past.pop()
    if (!prev) return false
    this.applyGroup(prev)
    disposeGroup(prev)
    this.emitHistory()
    return true
  }

  public redo(): boolean {
    if (!this.future.length) return false
    this.past.push(deepCloneGroup(this.modelRoot))
    if (this.past.length > 16) {
      const dropped = this.past.shift()
      disposeGroup(dropped)
    }
    const next = this.future.pop()
    if (!next) return false
    this.applyGroup(next)
    disposeGroup(next)
    this.emitHistory()
    return true
  }

  private checkpoint(): void {
    this.pushHistory()
    this.onCheckpoint?.()
  }

  private emitHistory(): void {
    this.onHistoryChange?.({ undo: this.canUndo(), redo: this.canRedo() })
  }

  private applyGroup(group: THREE.Group): void {
    this.transform.detach()
    this.clearModel()
    this.modelRoot.scale.copy(group.scale)
    this.modelRoot.position.copy(group.position)
    this.modelRoot.rotation.copy(group.rotation)
    const live = deepCloneGroup(group)
    for (const child of [...live.children]) this.modelRoot.add(child)
    this.hasFileTextures = false
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh && materialsHaveTexture(child.userData.fileMat ?? child.material)) {
        this.hasFileTextures = true
      }
    })
    this.tagParts()
    this.onParts?.(this.listParts())
    this.applyTextureMode()
    this.nodeSel = null
    this.nodeHover = null
    this.attachGizmo()
    this.highlight(this.selectedId)
    if (this.tool === 'points' || this.tool === 'cut') this.refreshNodeOverlay()
  }

  public async show(args: { spec: ModelSpec | null; glbUrl: string | null }): Promise<void> {
    if (args.glbUrl) {
      const gltf = await new GLTFLoader().loadAsync(args.glbUrl)
      this.clearModel()
      this.fitIn(gltf.scene)
      return
    }
    if (args.spec) {
      this.clearModel()
      this.fitIn(buildGroupFromSpec(args.spec))
    }
  }

  public setShowTextures(on: boolean): void {
    this.showTextures = on
    this.applyTextureMode()
  }

  public setKnife(opts: { shape: KnifeShape; size: KnifeSize; gizmo: 'translate' | 'rotate' | 'scale' }): void {
    this.knifeGizmo = opts.gizmo
    const sameShape = opts.shape === this.knifeShape
    const sameSize =
      this.knifeSize.width === opts.size.width &&
      this.knifeSize.height === opts.size.height &&
      this.knifeSize.depth === opts.size.depth &&
      this.knifeSize.radius === opts.size.radius &&
      this.knifeSize.thickness === opts.size.thickness
    this.knifeShape = opts.shape
    this.knifeSize = { ...opts.size }
    if (!sameShape || !sameSize) {
      this.knife.geometry.dispose()
      this.knife.geometry = makeKnifeGeometry(this.knifeShape, this.knifeSize)
      this.knife.scale.set(1, 1, 1)
      this.refreshKnifeEdges()
    }
    if (this.tool === 'cut') this.attachGizmo()
  }

  public setPartLabels(labels: { id: string; label: string }[]): void {
    const byId = new Map(labels.map((item) => [item.id, item.label.trim()]))
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const label = byId.get(String(child.userData.partId))
      if (!label) return
      child.name = label
      child.userData.partId = labelToId(label, String(child.userData.partId))
      child.userData.needsLabel = false
    })
    this.tagParts()
    this.onParts?.(this.listParts())
  }

  public addShape(shape: PartShape, color = '#c47a4a'): { id: string; label: string } {
    this.checkpoint()
    const used = new Set<string>()
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.partId) used.add(String(child.userData.partId))
    })
    const base = PART_SHAPE_LABELS[shape]
    let n = 1
    let id = shape
    while (used.has(id)) {
      n += 1
      id = `${shape}-${n}`
    }
    const label = n === 1 ? base : `${base} ${n}`
    const pos: [number, number, number] = [0, 0.55, 0]
    const selected = this.findPart(this.selectedId)
    if (selected) {
      const handle = partHandle(selected)
      pos[0] = handle.position.x + Math.max(0.55, selected.scale.x * 0.7)
      pos[1] = handle.position.y
      pos[2] = handle.position.z
    } else if (this.modelRoot.children.length) {
      const box = new THREE.Box3().setFromObject(this.modelRoot)
      if (!box.isEmpty() && isFiniteBox(box)) {
        this.modelRoot.updateMatrixWorld(true)
        this.inv.copy(this.modelRoot.matrixWorld).invert()
        this.world.set(0, box.max.y + 0.15, 0)
        this.local.copy(this.world).applyMatrix4(this.inv)
        pos[0] = this.local.x
        pos[1] = this.local.y
        pos[2] = this.local.z
      }
    }
    const mesh = meshFromPart(
      {
        id,
        label,
        shape,
        position: pos,
        rotation: [0, 0, 0],
        scale: [0.42, 0.42, 0.42],
        color,
        roughness: 0.72,
        metalness: 0.05,
      },
      'medium',
    )
    this.modelRoot.add(mesh)
    this.tagParts()
    this.onParts?.(this.listParts())
    this.selectedId = id
    this.onSelectPart(id)
    this.attachGizmo()
    return { id, label }
  }

  public cut(): { pieces: { id: string; label: string }[]; split: boolean } {
    if (!this.modelRoot.children.length) return { pieces: [], split: false }
    if (this.cutLoop.length < 3) return { pieces: [], split: false }
    const plane = planeFromPoints(this.cutLoop.map((node) => node.world))
    if (!plane) throw new Error('Those nodes do not define a cut plane')
    this.checkpoint()
    const targets: THREE.Mesh[] = []
    this.modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) targets.push(child)
    })
    const pieces: { id: string; label: string }[] = []
    let split = false
    for (const mesh of targets) {
      const halves = splitMeshByPlane(mesh, plane)
      if (halves.length < 2) {
        for (const geo of halves) geo.dispose()
        continue
      }
      split = true
      const parent = mesh.parent ?? this.modelRoot
      const sourceMat = mesh.material
      const pos = mesh.position.clone()
      const quat = mesh.quaternion.clone()
      const scale = mesh.scale.clone()
      mesh.removeFromParent()
      disposeMesh(mesh)
      for (const half of halves) {
        const islands = splitIslands(half)
        if (islands[0] !== half) half.dispose()
        for (const island of islands) {
          this.knifeSeq += 1
          const id = `piece-${this.knifeSeq}`
          const next = new THREE.Mesh(island, cloneMaterial(sourceMat))
          next.position.copy(pos)
          next.quaternion.copy(quat)
          next.scale.copy(scale)
          next.userData.partId = id
          next.userData.needsLabel = true
          next.userData.shape = guessShape(next)
          next.name = id
          parent.add(next)
          pieces.push({ id, label: '' })
        }
      }
    }
    this.clearCutLoop()
    this.tagParts()
    this.onParts?.(this.listParts())
    this.refreshNodeOverlay()
    return { pieces, split }
  }

  public getCutLoop(): CutLoopInfo {
    return { count: this.cutLoop.length, closed: this.cutClosed }
  }

  public clearCutLoop(): CutLoopInfo {
    this.cutLoop = []
    this.cutClosed = false
    this.syncCutPath()
    this.emitCutLoop()
    return this.getCutLoop()
  }

  public undoCutNode(): CutLoopInfo {
    this.cutClosed = false
    this.cutLoop.pop()
    this.syncCutPath()
    this.emitCutLoop()
    return this.getCutLoop()
  }

  public setEditing(tool: EditorTool): void {
    this.tool = tool
    const gizmo = tool === 'translate' || tool === 'rotate' || tool === 'scale'
    this.orbit.enabled = true
    this.orbit.mouseButtons.RIGHT = tool === 'points' || tool === 'cut' ? (-1 as THREE.MOUSE) : THREE.MOUSE.PAN
    this.brushCursor.visible = false
    if (tool !== 'points' && tool !== 'cut') {
      this.nodeHover = null
      this.nodeMarker.visible = false
      this.nodeCloud.visible = false
    } else {
      this.refreshNodeOverlay()
    }
    this.knife.visible = false
    if (tool !== 'cut' && tool !== 'orbit') this.clearCutLoop()
    else this.syncCutPath()
    if (gizmo || tool === 'points') {
      if (gizmo) this.transform.setMode(tool === 'rotate' ? 'rotate' : tool === 'scale' ? 'scale' : 'translate')
      this.attachGizmo()
    } else {
      this.transform.enabled = false
      this.transform.detach()
    }
  }

  public setBrush(radius: number, strength: number): void {
    this.brushRadius = radius
    this.brushStrength = strength
    this.brushCursor.scale.setScalar(radius)
  }

  public updatePart(
    id: string,
    patch: { color?: string; roughness?: number; metalness?: number },
  ): void {
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.partId !== id) return
      const mat = child.material
      if (mat instanceof THREE.MeshStandardMaterial) {
        if (patch.color) mat.color.set(patch.color)
        if (patch.roughness != null) mat.roughness = patch.roughness
        if (patch.metalness != null) mat.metalness = patch.metalness
      }
    })
  }

  public highlight(partId: string | null): void {
    this.selectedId = partId
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mat = child.material
      if (mat instanceof THREE.MeshStandardMaterial) {
        const on = child.userData.partId === partId
        mat.emissive.setHex(on ? 0x6a4a18 : 0x000000)
        mat.emissiveIntensity = on ? 0.55 : 0
      }
    })
    this.attachGizmo()
    if (this.tool === 'points' || this.tool === 'cut') this.refreshNodeOverlay()
  }

  public ground(): void {
    this.checkpoint()
    const mesh = this.findPart(this.selectedId)
    const target = mesh ? partHandle(mesh) : this.modelRoot
    target.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(target)
    if (box.isEmpty() || !isFiniteBox(box)) return
    this.applyWorldTranslation(target, new THREE.Vector3(0, -box.min.y, 0))
  }

  public recenter(): void {
    this.checkpoint()
    const mesh = this.findPart(this.selectedId)
    const target = mesh ? partHandle(mesh) : this.modelRoot
    target.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(target)
    if (box.isEmpty() || !isFiniteBox(box)) return
    const center = box.getCenter(new THREE.Vector3())
    const worldDelta = new THREE.Vector3(-center.x, 0, -center.z)
    if (!this.selectedId) worldDelta.y = -box.min.y
    this.applyWorldTranslation(target, worldDelta)
    this.frameCamera(target)
  }

  private applyWorldTranslation(object: THREE.Object3D, worldDelta: THREE.Vector3): void {
    if (worldDelta.lengthSq() < 1e-12) return
    object.updateMatrixWorld(true)
    const worldPos = new THREE.Vector3()
    object.getWorldPosition(worldPos)
    worldPos.add(worldDelta)
    if (object.parent) {
      object.parent.worldToLocal(worldPos)
      object.position.copy(worldPos)
    } else {
      object.position.add(worldDelta)
    }
    object.updateMatrixWorld(true)
  }

  private frameCamera(target: THREE.Object3D): void {
    target.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(target)
    if (box.isEmpty() || !isFiniteBox(box)) return
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.08)
    const fov = (this.camera.fov * Math.PI) / 180
    const dist = Math.max((maxDim * 0.72) / Math.tan(fov / 2) * 1.15, 1.2)
    const offset = this.camera.position.clone().sub(this.orbit.target)
    if (offset.lengthSq() < 1e-8) offset.set(2.4, 1.8, 3.4)
    offset.setLength(dist)
    this.orbit.target.copy(center)
    this.camera.position.copy(center).add(offset)
    this.camera.lookAt(center)
    this.orbit.update()
  }

  public capturePng(): string {
    return this.renderer.domElement.toDataURL('image/png')
  }

  public captureSpec(base?: ModelSpec | null): ModelSpec | null {
    const byId = new Map((base?.parts ?? []).map((part) => [part.id, part]))
    const parts: ModelPart[] = []
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.partId) return
      const id = String(child.userData.partId)
      const prior = byId.get(id)
      const mat = child.material
      const color =
        mat instanceof THREE.MeshStandardMaterial ? `#${mat.color.getHexString()}` : prior?.color ?? '#c47a4a'
      const shape = PART_SHAPES.includes(child.userData.shape as PartShape)
        ? (child.userData.shape as PartShape)
        : prior?.shape ?? guessShape(child)
      const handle = partHandle(child)
      const ancestor = handle.parent
      const parentId =
        ancestor && ancestor !== this.modelRoot && ancestor.userData.partId
          ? String(ancestor.userData.partId)
          : undefined
      parts.push({
        id,
        label: child.name || prior?.label || id,
        shape,
        parent: parentId,
        position: [handle.position.x, handle.position.y, handle.position.z],
        rotation: [handle.rotation.x, handle.rotation.y, handle.rotation.z],
        scale: [
          Math.max(0.04, child.scale.x),
          Math.max(0.04, child.scale.y),
          Math.max(0.04, child.scale.z),
        ],
        color,
        roughness: mat instanceof THREE.MeshStandardMaterial ? mat.roughness : prior?.roughness ?? 0.7,
        metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : prior?.metalness ?? 0.05,
      })
    })
    if (!parts.length) return base ?? null
    return {
      name: base?.name || 'model',
      kind: base?.kind || 'character',
      style: base?.style || 'clay',
      density: base?.density || 'medium',
      parts,
    }
  }

  public exportGlb(): Promise<Blob> {
    return this.exportAs('glb')
  }

  public exportAs(ext: ModelExt): Promise<Blob> {
    if (ext === 'obj') {
      const text = new OBJExporter().parse(this.modelRoot)
      return Promise.resolve(new Blob([text], { type: 'model/obj' }))
    }
    if (this.animKeys.length >= 2 && ext === 'glb') return this.exportAnimatedGlb()
    return new Promise((resolve, reject) => {
      new GLTFExporter().parse(
        this.modelRoot,
        (result) => {
          if (ext === 'glb') {
            if (result instanceof ArrayBuffer) {
              resolve(new Blob([result], { type: 'model/gltf-binary' }))
              return
            }
            reject(new Error('Expected a binary GLB'))
            return
          }
          if (result instanceof ArrayBuffer) {
            reject(new Error('Expected glTF JSON'))
            return
          }
          resolve(new Blob([JSON.stringify(result)], { type: 'model/gltf+json' }))
        },
        (err) => reject(err),
        { binary: ext === 'glb' },
      )
    })
  }

  public getClip(): ClipInfo {
    return {
      playing: this.animPlaying,
      playhead: this.animPlayhead,
      duration: clipDuration(this.animKeys, this.animPlayhead),
      selectedId: this.animSelected,
      keys: this.animKeys.map((key) => ({ id: key.id, time: key.time })),
    }
  }

  public addAnimFrame(): ClipInfo {
    this.animPlaying = false
    this.flushLiveToSelected()
    const pose = this.captureAnimPose()
    if (!pose.length) return this.emitClip()
    if (!this.animKeys.length) {
      this.animSeq += 1
      const id = `frame-${this.animSeq}`
      this.animKeys = [{ id, time: 0, meshes: pose }]
      this.animSelected = id
      this.animPlayhead = 0
      return this.emitClip()
    }
    const onKey = this.animKeys.find((key) => Math.abs(key.time - this.animPlayhead) < 1e-3)
    if (onKey) {
      this.animSeq += 1
      const time = this.lastAnimTime() + 0.25
      const id = `frame-${this.animSeq}`
      this.animKeys.push({ id, time, meshes: pose })
      this.animKeys.sort((a, b) => a.time - b.time)
      this.animSelected = id
      this.animPlayhead = time
      this.applyAnimPose(pose)
      return this.emitClip()
    }
    this.animSeq += 1
    const id = `frame-${this.animSeq}`
    this.animKeys.push({ id, time: this.animPlayhead, meshes: pose })
    this.animKeys.sort((a, b) => a.time - b.time)
    this.animSelected = id
    return this.emitClip()
  }

  public updateAnimFrame(): ClipInfo {
    this.animPlaying = false
    this.flushLiveToSelected()
    return this.emitClip()
  }

  public deleteAnimFrame(id: string): ClipInfo {
    this.animPlaying = false
    this.animKeys = this.animKeys.filter((key) => key.id !== id)
    if (this.animSelected === id) this.animSelected = this.animKeys[0]?.id ?? null
    const selected = this.animKeys.find((key) => key.id === this.animSelected)
    if (selected) {
      this.animPlayhead = selected.time
      this.applyAnimPose(selected.meshes)
    }
    return this.emitClip()
  }

  public selectAnimFrame(id: string): ClipInfo {
    this.animPlaying = false
    this.flushLiveToSelected()
    const key = this.animKeys.find((item) => item.id === id)
    if (!key) return this.emitClip()
    this.animSelected = key.id
    this.animPlayhead = key.time
    this.applyAnimPose(key.meshes)
    return this.emitClip()
  }

  public setAnimPlayhead(time: number): ClipInfo {
    const next = Math.max(0, time)
    if (!this.animPlaying) this.flushLiveToSelected()
    this.animPlaying = false
    this.animPlayhead = next
    const exact = this.animKeys.find((key) => Math.abs(key.time - next) < 1e-3)
    this.animSelected = exact?.id ?? this.animSelected
    this.applyInterpolated(next)
    return this.emitClip()
  }

  public playAnim(): ClipInfo {
    if (this.animKeys.length < 2) return this.emitClip()
    this.flushLiveToSelected()
    this.animPlaying = true
    return this.emitClip()
  }

  public pauseAnim(): ClipInfo {
    this.animPlaying = false
    return this.emitClip()
  }

  public exportAnimatedGlb(): Promise<Blob> {
    this.flushLiveToSelected()
    if (this.animKeys.length < 2) {
      return Promise.reject(new Error('Add at least two frames before exporting an animation'))
    }
    const root = this.buildAnimatedExport()
    return new Promise((resolve, reject) => {
      const clips = root.userData.clips as THREE.AnimationClip[] | undefined
      new GLTFExporter().parse(
        root,
        (result) => {
          disposeGroup(root)
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: 'model/gltf-binary' }))
            return
          }
          reject(new Error('Expected a binary GLB'))
        },
        (err) => {
          disposeGroup(root)
          reject(err)
        },
        { binary: true, animations: clips ?? [] },
      )
    })
  }

  public async loadFile(input: File | File[]): Promise<{ spec?: ModelSpec; hasTextures: boolean }> {
    const files = Array.isArray(input) ? input : [input]
    if (!files.length) throw new Error('No files to import')
    let primary = files[0]
    let kind = await sniffModel(primary)
    for (const file of files) {
      const next = await sniffModel(file)
      if (next && next !== 'json') {
        primary = file
        kind = next
        break
      }
    }
    if (!kind) throw new Error('Use a GLB, GLTF, OBJ, or Meshbench JSON file')
    this.revokeImportUrls()
    if (kind === 'json') {
      const raw = JSON.parse(await primary.text()) as ModelSpec
      if (!raw || !Array.isArray(raw.parts) || raw.parts.length === 0) {
        throw new Error('That JSON file is not a Meshbench model')
      }
      this.clearModel()
      this.fitIn(buildGroupFromSpec(raw))
      return { spec: raw, hasTextures: false }
    }
    const object = await this.parseImport(primary, kind, files)
    this.clearModel()
    this.fitIn(object)
    return { hasTextures: this.hasFileTextures }
  }

  public dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown, true)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onPointerUp)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    this.orbit.dispose()
    this.transform.dispose()
    this.revokeImportUrls()
    this.nodeMarker.geometry.dispose()
    ;(this.nodeMarker.material as THREE.Material).dispose()
    this.nodeCloud.geometry.dispose()
    ;(this.nodeCloud.material as THREE.Material).dispose()
    this.cutPath.geometry.dispose()
    ;(this.cutPath.material as THREE.Material).dispose()
    this.cutDots.geometry.dispose()
    ;(this.cutDots.material as THREE.Material).dispose()
    this.cutPlane.geometry.dispose()
    ;(this.cutPlane.material as THREE.Material).dispose()
    this.knife.geometry.dispose()
    ;(this.knife.material as THREE.Material).dispose()
    for (const child of [...this.knife.children]) {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    this.renderer.dispose()
    this.renderer.domElement.remove()
    for (const group of [...this.past, ...this.future]) disposeGroup(group)
    this.past = []
    this.future = []
  }

  private fitIn(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.visible = true
      child.frustumCulled = false
      child.geometry.computeBoundingBox()
      child.geometry.computeBoundingSphere()
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          mat.side = THREE.DoubleSide
        })
      } else if (child.material) {
        child.material.side = THREE.DoubleSide
      }
    })
    this.modelRoot.add(object)
    object.updateMatrixWorld(true)
    const box = new THREE.Box3()
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const next = new THREE.Box3().setFromObject(child)
      if (!isFiniteBox(next)) return
      box.union(next)
    })
    if (box.isEmpty() || !isFiniteBox(box)) {
      this.modelRoot.remove(object)
      throw new Error('That file has no visible mesh')
    }
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    const scale = 2.2 / maxDim
    this.modelRoot.scale.setScalar(Number.isFinite(scale) && scale > 0 ? Math.min(scale, 80) : 1)
    this.modelRoot.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(this.modelRoot)
    if (!fitted.isEmpty() && isFiniteBox(fitted)) {
      const fittedCenter = fitted.getCenter(new THREE.Vector3())
      this.applyWorldTranslation(
        this.modelRoot,
        new THREE.Vector3(-fittedCenter.x, -fitted.min.y, -fittedCenter.z),
      )
      this.frameCamera(this.modelRoot)
    }
    this.stampFileMaterials(object)
    this.applyTextureMode()
    this.tagParts()
    this.onParts?.(this.listParts())
    this.attachGizmo()
    if (this.tool === 'points' || this.tool === 'cut') this.refreshNodeOverlay()
  }

  private async parseImport(
    primary: File,
    kind: 'glb' | 'gltf' | 'obj',
    files: File[],
  ): Promise<THREE.Object3D> {
    const bag = this.fileManager(files)
    try {
      if (kind === 'obj') {
        const mtlFile =
          files.find((file) => file.name.toLowerCase().endsWith('.mtl')) ??
          files.find((file) => file.name.toLowerCase() === primary.name.replace(/\.obj$/i, '.mtl').toLowerCase())
        const loader = new OBJLoader(bag.manager)
        if (mtlFile) {
          const materials = new MTLLoader(bag.manager).parse(await mtlFile.text(), '')
          materials.preload()
          await bag.ready()
          loader.setMaterials(materials)
        }
        const object = loader.parse(await primary.text())
        await bag.ready()
        if (!mtlFile) {
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({ color: 0xc47a4a, roughness: 0.7 })
            }
          })
        }
        return object
      }
      const loader = new GLTFLoader(bag.manager)
      const gltf = await loader.parseAsync(await primary.arrayBuffer(), '')
      await bag.ready()
      return gltf.scene
    } catch (error) {
      bag.dispose()
      throw error
    }
  }

  private fileManager(files: File[]) {
    const byName = new Map(
      files.map((file) => [file.name.replace(/\\/g, '/').split('/').pop()!.toLowerCase(), file]),
    )
    const urls: string[] = []
    let started = 0
    let ended = 0
    let settle: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      settle = resolve
    })
    const manager = new THREE.LoadingManager()
    manager.setURLModifier((url) => {
      const name = url.split(/[?#]/)[0].split(/[\\/]/).pop()?.toLowerCase()
      if (!name) return url
      const file = byName.get(name)
      if (!file) return url
      const blob = URL.createObjectURL(file)
      urls.push(blob)
      this.importUrls.push(blob)
      return blob
    })
    const start = manager.itemStart.bind(manager)
    const end = manager.itemEnd.bind(manager)
    manager.itemStart = (url) => {
      started += 1
      start(url)
    }
    manager.itemEnd = (url) => {
      end(url)
      ended += 1
      if (ended >= started) settle()
    }
    manager.onLoad = () => settle()
    manager.onError = () => {
      ended += 1
      if (ended >= started) settle()
    }
    return {
      manager,
      ready: () => (started === 0 ? Promise.resolve() : gate),
      dispose: () => {
        for (const url of urls) URL.revokeObjectURL(url)
      },
    }
  }

  private stampFileMaterials(object: THREE.Object3D): void {
    this.hasFileTextures = false
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const current = child.material
      child.userData.fileMat = current
      child.userData.plainMat = makePlainMaterials(current)
      if (materialsHaveTexture(current)) this.hasFileTextures = true
    })
  }

  private applyTextureMode(): void {
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const next = this.showTextures && this.hasFileTextures ? child.userData.fileMat : child.userData.plainMat
      if (next) child.material = next
    })
  }

  private revokeImportUrls(): void {
    for (const url of this.importUrls) URL.revokeObjectURL(url)
    this.importUrls = []
  }

  private clearModel(): void {
    this.resetAnim()
    this.transform.detach()
    this.nodeSel = null
    this.nodeHover = null
    this.nodeMarker.visible = false
    this.nodeCloud.visible = false
    this.clearCutLoop()
    while (this.modelRoot.children.length) this.modelRoot.remove(this.modelRoot.children[0])
    this.modelRoot.scale.set(1, 1, 1)
    this.modelRoot.position.set(0, 0, 0)
    this.modelRoot.rotation.set(0, 0, 0)
  }

  private onResize = (): void => {
    const w = this.mount.clientWidth || 640
    const h = this.mount.clientHeight || 480
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private resetAnim(): void {
    this.animKeys = []
    this.animPlayhead = 0
    this.animPlaying = false
    this.animSelected = null
    this.emitClip()
  }

  private emitClip(): ClipInfo {
    const info = this.getClip()
    this.onClipChange?.(info)
    return info
  }

  private emitCutLoop(): CutLoopInfo {
    const info = this.getCutLoop()
    this.onCutLoopChange?.(info)
    return info
  }

  private addCutNode(pick: VertPick): void {
    if (this.cutClosed) return
    const point = pick.world.clone()
    const last = this.cutLoop[this.cutLoop.length - 1]
    if (last && last.world.distanceTo(point) < 0.012) return
    const first = this.cutLoop[0]
    if (first && this.cutLoop.length >= 3 && first.world.distanceTo(point) < 0.045) {
      this.cutClosed = true
      this.syncCutPath()
      this.emitCutLoop()
      return
    }
    this.cutLoop.push({ world: point, mesh: pick.mesh })
    this.syncCutPath()
    this.emitCutLoop()
  }

  private syncCutPath(): void {
    const nodes = this.cutLoop
    if (!nodes.length || (this.tool !== 'cut' && this.tool !== 'orbit')) {
      this.cutPath.visible = false
      this.cutDots.visible = false
      this.cutPlane.visible = false
      return
    }
    const line: THREE.Vector3[] = []
    const segs = this.cutClosed && nodes.length > 1 ? nodes.length : nodes.length - 1
    for (let i = 0; i < segs; i++) {
      const a = nodes[i]
      const b = nodes[(i + 1) % nodes.length]
      const path = this.surfacePath(a, b)
      if (!line.length) line.push(path[0])
      for (let k = 1; k < path.length; k++) line.push(path[k])
    }
    this.cutPath.geometry.dispose()
    this.cutPath.geometry = new THREE.BufferGeometry().setFromPoints(line.length ? line : nodes.map((n) => n.world))
    this.cutDots.geometry.dispose()
    this.cutDots.geometry = new THREE.BufferGeometry().setFromPoints(nodes.map((n) => n.world))
    this.cutPath.visible = true
    this.cutDots.visible = true
    this.syncCutPlane(nodes.map((n) => n.world))
  }

  private syncCutPlane(points: THREE.Vector3[]): void {
    const plane = points.length >= 3 ? planeFromPoints(points) : null
    if (!plane) {
      this.cutPlane.visible = false
      return
    }
    const origin = new THREE.Vector3()
    for (const p of points) origin.add(p)
    origin.multiplyScalar(1 / points.length)
    let span = 0.4
    for (const p of points) span = Math.max(span, p.distanceTo(origin) * 2.4)
    this.cutPlane.position.copy(origin)
    this.cutPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal)
    this.cutPlane.scale.set(span, span, 1)
    this.cutPlane.visible = true
  }

  private surfacePath(
    a: { world: THREE.Vector3; mesh: THREE.Mesh },
    b: { world: THREE.Vector3; mesh: THREE.Mesh },
  ): THREE.Vector3[] {
    if (a.world.distanceToSquared(b.world) < 1e-8) return [a.world.clone()]
    if (a.mesh === b.mesh) {
      const along = geodesicOnMesh(a.mesh, a.world, b.world)
      if (along.length >= 2) return along
    }
    return [a.world.clone(), b.world.clone()]
  }

  private lastAnimTime(): number {
    let max = 0
    for (const key of this.animKeys) max = Math.max(max, key.time)
    return max
  }

  private tickAnim(dt: number): void {
    const duration = clipDuration(this.animKeys)
    if (duration <= 0) return
    this.animPlayhead += dt
    if (this.animPlayhead >= duration) this.animPlayhead %= duration
    this.applyInterpolated(this.animPlayhead)
    this.onClipChange?.(this.getClip())
  }

  private flushLiveToSelected(): void {
    if (this.animPlaying || !this.animSelected) return
    const key = this.animKeys.find((item) => item.id === this.animSelected)
    if (!key || Math.abs(key.time - this.animPlayhead) > 1e-3) return
    const pose = this.captureAnimPose()
    if (pose.length) key.meshes = pose
  }

  private captureAnimPose(): AnimPoseMesh[] {
    const meshes: AnimPoseMesh[] = []
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.partId) return
      const pos = child.geometry.getAttribute('position')
      if (!pos) return
      const handle = partHandle(child)
      meshes.push({
        partId: String(child.userData.partId),
        position: [handle.position.x, handle.position.y, handle.position.z],
        quaternion: [handle.quaternion.x, handle.quaternion.y, handle.quaternion.z, handle.quaternion.w],
        scale: [child.scale.x, child.scale.y, child.scale.z],
        positions: new Float32Array(pos.array as ArrayLike<number>),
      })
    })
    return meshes
  }

  private applyInterpolated(time: number): void {
    if (!this.animKeys.length) return
    if (this.animKeys.length === 1 || time <= this.animKeys[0].time) {
      this.applyAnimPose(this.animKeys[0].meshes)
      return
    }
    const last = this.animKeys[this.animKeys.length - 1]
    if (time >= last.time) {
      this.applyAnimPose(last.meshes)
      return
    }
    let index = 0
    while (index < this.animKeys.length - 1 && this.animKeys[index + 1].time < time) index += 1
    const a = this.animKeys[index]
    const b = this.animKeys[index + 1]
    const u = (time - a.time) / Math.max(1e-6, b.time - a.time)
    const other = new Map(b.meshes.map((mesh) => [mesh.partId, mesh]))
    this.applyAnimPose(a.meshes.map((mesh) => {
      const match = other.get(mesh.partId)
      return match ? lerpPose(mesh, match, u) : mesh
    }))
  }

  private applyAnimPose(meshes: AnimPoseMesh[], root: THREE.Object3D = this.modelRoot): void {
    const byId = new Map(meshes.map((mesh) => [mesh.partId, mesh]))
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.partId) return
      const pose = byId.get(String(child.userData.partId))
      if (!pose) return
      const handle = partHandle(child)
      handle.position.set(pose.position[0], pose.position[1], pose.position[2])
      handle.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3])
      child.scale.set(pose.scale[0], pose.scale[1], pose.scale[2])
      const attr = child.geometry.getAttribute('position')
      if (!attr || attr.count * attr.itemSize !== pose.positions.length) return
      this.ensureUniqueGeometry(child)
      const live = child.geometry.getAttribute('position')
      ;(live.array as Float32Array).set(pose.positions)
      live.needsUpdate = true
      child.geometry.computeVertexNormals()
      child.geometry.computeBoundingBox()
      child.geometry.computeBoundingSphere()
    })
    if (root === this.modelRoot && this.tool === 'points') this.refreshNodeOverlay()
  }

  private buildAnimatedExport(): THREE.Group {
    const bind = this.animKeys[0]
    const clone = deepCloneGroup(this.modelRoot)
    this.applyAnimPose(bind.meshes, clone)
    const times = this.animKeys.map((key) => key.time)
    const tracks: THREE.KeyframeTrack[] = []
    const later = this.animKeys.slice(1)
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.partId) return
      const partId = String(child.userData.partId)
      child.name = partId
      const rest = bind.meshes.find((mesh) => mesh.partId === partId)
      if (!rest) return
      const morphs: THREE.BufferAttribute[] = []
      for (const key of later) {
        const pose = key.meshes.find((mesh) => mesh.partId === partId)
        if (!pose || pose.positions.length !== rest.positions.length) continue
        const delta = new Float32Array(rest.positions.length)
        for (let i = 0; i < delta.length; i++) delta[i] = pose.positions[i] - rest.positions[i]
        morphs.push(new THREE.Float32BufferAttribute(delta, 3))
      }
      if (morphs.length) {
        child.geometry = child.geometry.clone()
        child.geometry.morphAttributes.position = morphs
        child.morphTargetInfluences = morphs.map(() => 0)
        for (let i = 0; i < morphs.length; i++) {
          const values = this.animKeys.map((_, keyIndex) => (keyIndex === i + 1 ? 1 : 0))
          tracks.push(
            new THREE.NumberKeyframeTrack(`${partId}.morphTargetInfluences[${i}]`, times.slice(), values),
          )
        }
      }
      const pos: number[] = []
      const quat: number[] = []
      const scale: number[] = []
      for (const key of this.animKeys) {
        const pose = key.meshes.find((mesh) => mesh.partId === partId) ?? rest
        pos.push(...pose.position)
        quat.push(...pose.quaternion)
        scale.push(...pose.scale)
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${partId}.position`, times.slice(), pos))
      tracks.push(new THREE.QuaternionKeyframeTrack(`${partId}.quaternion`, times.slice(), quat))
      tracks.push(new THREE.VectorKeyframeTrack(`${partId}.scale`, times.slice(), scale))
    })
    const duration = times[times.length - 1] || 1
    clone.userData.clips = [new THREE.AnimationClip('meshbench', duration, tracks)]
    return clone
  }

  private findPart(id: string | null): THREE.Mesh | null {
    if (!id) return null
    let found: THREE.Mesh | null = null
    this.modelRoot.traverse((child) => {
      if (found || !(child instanceof THREE.Mesh)) return
      if (child.userData.partId === id) found = child
    })
    return found
  }

  private tagParts(): void {
    let index = 0
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (!child.userData.partId) {
        child.userData.partId = child.name || `part-${index}`
      }
      if (!child.name) child.name = String(child.userData.partId)
      if (!child.userData.shape) child.userData.shape = guessShape(child)
      index += 1
    })
  }

  private listParts(): { id: string; label: string }[] {
    const parts: { id: string; label: string }[] = []
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.partId) return
      parts.push({
        id: String(child.userData.partId),
        label: child.name || String(child.userData.partId),
      })
    })
    return parts
  }

  private attachGizmo(): void {
    if (this.tool === 'cut') {
      this.transform.enabled = false
      this.transform.detach()
      return
    }
    if (this.tool === 'points') {
      this.attachNodeGizmo()
      return
    }
    if (this.tool !== 'translate' && this.tool !== 'rotate' && this.tool !== 'scale') {
      this.transform.enabled = false
      this.transform.detach()
      return
    }
    this.transform.enabled = true
    this.transform.setSize(1.65)
    const mesh = this.findPart(this.selectedId)
    if (mesh) this.transform.attach(this.tool === 'scale' ? mesh : partHandle(mesh))
    else this.transform.detach()
  }

  private attachNodeGizmo(): void {
    if (this.tool !== 'points' || !this.nodeSel) {
      this.transform.enabled = false
      this.transform.detach()
      return
    }
    this.nodeAnchor.position.copy(this.nodeSel.world)
    this.nodeAnchor.rotation.set(0, 0, 0)
    this.nodeAnchor.scale.set(1, 1, 1)
    this.transform.setMode('translate')
    this.transform.setSpace('world')
    this.transform.setSize(1.15)
    this.transform.enabled = true
    this.transform.attach(this.nodeAnchor)
  }

  private onGizmoChange(): void {
    if (this.tool !== 'points' || !this.nodeSel) return
    this.nodeAnchor.updateMatrixWorld(true)
    this.nodeAnchor.getWorldPosition(this.world)
    this.moveNode(this.world.clone())
  }

  private setPointer(ev: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  }

  private hitModel(): THREE.Intersection | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObject(this.modelRoot, true)[0]
  }

  private isGizmoTool(): boolean {
    return (
      this.tool === 'translate' ||
      this.tool === 'rotate' ||
      this.tool === 'scale' ||
      (this.tool === 'points' && !!this.nodeSel)
    )
  }

  private hitVisibleGizmo(): boolean {
    if (!this.isGizmoTool() || !this.transform.object) return false
    const helper = this.transform.getHelper()
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits: THREE.Intersection[] = []
    this.intersectHandles(helper, hits)
    return hits.length > 0
  }

  private intersectHandles(object: THREE.Object3D, hits: THREE.Intersection[]): void {
    if (!object.visible) return
    if (object.type === 'TransformControlsPlane') return
    if ((object as { tag?: string }).tag === 'helper') return
    const material = (object as THREE.Mesh).material
    if (material instanceof THREE.Material && !material.visible) return
    object.raycast(this.raycaster, hits)
    for (const child of object.children) this.intersectHandles(child, hits)
  }

  private isSculptTool(): boolean {
    return this.tool === 'inflate' || this.tool === 'smooth'
  }

  private onContextMenu = (ev: Event): void => {
    ev.preventDefault()
  }

  private onPointerDown = (ev: PointerEvent): void => {
    this.setPointer(ev)

    if (this.tool === 'cut' && ev.button === 2) {
      ev.preventDefault()
      ev.stopPropagation()
      this.orbit.enabled = true
      this.undoCutNode()
      return
    }

    if (this.tool === 'points' && ev.button === 2) {
      ev.preventDefault()
      ev.stopPropagation()
      this.orbit.enabled = true
      const hit = this.hitModel()
      if (!hit || !(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return
      this.checkpoint()
      const created = this.insertNodeOnSurface(hit)
      if (!created) return
      this.nodeSel = created
      this.nodeHover = created
      const partId = hit.object.userData.partId as string | undefined
      if (partId) {
        this.onSelectPart(partId)
        this.selectedId = partId
      }
      this.attachNodeGizmo()
      this.refreshNodeOverlay()
      return
    }

    if (this.hitVisibleGizmo()) {
      this.orbit.enabled = false
      this.transform.enabled = true
      return
    }

    if (this.tool === 'cut') {
      if (ev.button !== 0) {
        this.orbit.enabled = true
        return
      }
      this.updateNodeOverlayView(true)
      const pick = this.pickCutVertex()
      if (pick) {
        ev.preventDefault()
        ev.stopPropagation()
        this.addCutNode(pick)
      }
      this.orbit.enabled = true
      return
    }

    const hit = this.hitModel()
    const partId = hit?.object.userData.partId as string | undefined

    if (this.tool === 'points') {
      const pick = this.pickNode(hit)
      if (pick) {
        ev.preventDefault()
        ev.stopPropagation()
        this.ensureUniqueGeometry(pick.mesh)
        this.nodeSel = this.pickNode(hit) ?? pick
        this.nodeHover = this.nodeSel
        if (partId) {
          this.onSelectPart(partId)
          this.selectedId = partId
        }
        this.orbit.enabled = true
        this.attachNodeGizmo()
        this.syncNodeMarker()
        return
      }
      this.orbit.enabled = true
      return
    }

    if (this.isSculptTool() && hit && hit.object instanceof THREE.Mesh) {
      if (partId) this.onSelectPart(partId)
      ev.preventDefault()
      ev.stopPropagation()
      this.checkpoint()
      this.renderer.domElement.setPointerCapture(ev.pointerId)
      this.sculpting = true
      this.sculptTarget = hit.object
      this.orbit.enabled = false
      this.placeBrush(hit.point)
      this.sculpt(hit)
      return
    }

    if (hit && partId) {
      ev.stopPropagation()
      this.orbit.enabled = false
      if (this.tool === 'orbit') {
        this.tool = 'translate'
        this.transform.setMode('translate')
      }
      if (this.isGizmoTool()) this.transform.enabled = true
      this.onSelectPart(partId)
      this.selectedId = partId
      this.attachGizmo()
      return
    }

    if (this.isGizmoTool()) {
      this.transform.enabled = false
      this.transform.axis = null
    }
    this.orbit.enabled = true
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (this.tool === 'points' || this.tool === 'cut') {
      this.setPointer(ev)
      if (this.transform.dragging) return
      this.nodeHover = this.tool === 'cut' ? this.pickCutVertex() : this.pickNode()
      this.syncNodeMarker()
      return
    }
    if (!this.isSculptTool()) {
      this.brushCursor.visible = false
      return
    }
    this.setPointer(ev)
    const hit = this.hitModel()
    if (!hit) {
      if (!this.sculpting) this.brushCursor.visible = false
      return
    }
    this.placeBrush(hit.point)
    if (this.sculpting && this.sculptTarget) this.sculpt(hit)
  }

  private onPointerUp = (): void => {
    this.sculpting = false
    this.sculptTarget = null
    this.orbit.enabled = true
    if (this.isGizmoTool()) this.transform.enabled = true
  }

  private placeBrush(point: THREE.Vector3): void {
    this.brushCursor.visible = true
    this.brushCursor.position.copy(point)
    this.brushCursor.scale.setScalar(this.brushRadius)
  }

  private ensureUniqueGeometry(mesh: THREE.Mesh): void {
    const geo = mesh.geometry
    if (!geo.userData.unique) {
      mesh.geometry = geo.clone()
      mesh.geometry.userData.unique = true
    }
  }

  private insertNodeOnSurface(hit: THREE.Intersection): VertPick | null {
    if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return null
    const mesh = hit.object
    this.ensureUniqueGeometry(mesh)
    const geo = mesh.geometry
    const pos = geo.getAttribute('position')
    if (!pos) return null
    mesh.updateMatrixWorld(true)
    this.inv.copy(mesh.matrixWorld).invert()
    this.local.copy(hit.point).applyMatrix4(this.inv)
    if (!geo.index) {
      const identity = new Uint32Array(pos.count)
      for (let i = 0; i < pos.count; i++) identity[i] = i
      geo.setIndex(new THREE.BufferAttribute(identity, 1))
    }
    const index = geo.index
    if (!index) return null
    const base = hit.faceIndex * 3
    if (base + 2 >= index.count) return null
    const ia = index.getX(base)
    const ib = index.getX(base + 1)
    const ic = index.getX(base + 2)
    const a = new THREE.Vector3().fromBufferAttribute(pos, ia)
    const b = new THREE.Vector3().fromBufferAttribute(pos, ib)
    const c = new THREE.Vector3().fromBufferAttribute(pos, ic)
    const bary = triangleBarycentric(this.local, a, b, c)
    const newIndex = appendInterpolatedVertex(geo, ia, ib, ic, bary)
    splitIndexedTriangle(geo, base, ia, ib, ic, newIndex)
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    geo.userData.unique = true
    return { mesh, indices: [newIndex], world: hit.point.clone() }
  }

  private pickNode(_hit?: THREE.Intersection): VertPick | null {
    return this.pickOverlayNode()
  }

  private pickCutVertex(): VertPick | null {
    const hit = this.hitModel()
    if (hit && hit.object instanceof THREE.Mesh) {
      const snapped = this.vertPickFromHit(hit)
      if (snapped) return snapped
    }
    return this.pickOverlayNode()
  }

  private vertPickFromHit(hit: THREE.Intersection): VertPick | null {
    const mesh = hit.object as THREE.Mesh
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return null
    const face = hit.face
    const index = mesh.geometry.getIndex()
    const ids: number[] = []
    if (face) {
      ids.push(face.a, face.b, face.c)
    } else if (hit.faceIndex != null) {
      const base = hit.faceIndex * 3
      if (index) {
        if (base + 2 < index.count) ids.push(index.getX(base), index.getX(base + 1), index.getX(base + 2))
      } else if (base + 2 < pos.count) ids.push(base, base + 1, base + 2)
    }
    if (!ids.length) return this.vertPickFromIndex(mesh, Math.min(pos.count - 1, 0))
    mesh.updateMatrixWorld(true)
    let best = ids[0]
    let bestD = Infinity
    for (const id of ids) {
      this.tmp.fromBufferAttribute(pos, id).applyMatrix4(mesh.matrixWorld)
      const d = this.tmp.distanceToSquared(hit.point)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return this.vertPickFromIndex(mesh, best)
  }

  private pickOverlayNode(): VertPick | null {
    const count = this.nodeCloud.geometry.drawRange.count
    if (!this.nodeCloud.visible || count <= 0 || !Number.isFinite(count)) return null
    const pos = this.nodeCloud.geometry.getAttribute('position')
    if (!pos) return null
    const maxNdc = 0.06
    let best = -1
    let bestScore = maxNdc * maxNdc
    for (let i = 0; i < count; i++) {
      this.tmp.fromBufferAttribute(pos, i)
      this.world.copy(this.tmp).project(this.camera)
      if (this.world.z < -1 || this.world.z > 1) continue
      const dx = this.world.x - this.pointer.x
      const dy = this.world.y - this.pointer.y
      const score = dx * dx + dy * dy
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) return null
    this.tmp.fromBufferAttribute(pos, best)
    if (this.nodeOccluded(this.tmp)) return null
    const mesh = this.nodeShadeMesh[best]
    const index = this.nodeShadeIndex[best]
    if (!mesh || index == null) return null
    return this.vertPickFromIndex(mesh, index)
  }

  private vertPickFromIndex(mesh: THREE.Mesh, index: number): VertPick | null {
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return null
    this.tmp.fromBufferAttribute(pos, index)
    const indices: number[] = [index]
    if (pos.count <= 40_000) {
      for (let i = 0; i < pos.count; i++) {
        if (i === index) continue
        if (
          Math.abs(pos.getX(i) - this.tmp.x) < 1e-5 &&
          Math.abs(pos.getY(i) - this.tmp.y) < 1e-5 &&
          Math.abs(pos.getZ(i) - this.tmp.z) < 1e-5
        ) {
          indices.push(i)
        }
      }
    }
    mesh.updateMatrixWorld(true)
    this.world.copy(this.tmp).applyMatrix4(mesh.matrixWorld)
    return { mesh, indices, world: this.world.clone() }
  }

  private moveNode(world: THREE.Vector3): void {
    const pick = this.nodeSel
    if (!pick) return
    this.ensureUniqueGeometry(pick.mesh)
    const mesh = pick.mesh
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    mesh.updateMatrixWorld(true)
    this.inv.copy(mesh.matrixWorld).invert()
    this.local.copy(world).applyMatrix4(this.inv)
    for (const i of pick.indices) pos.setXYZ(i, this.local.x, this.local.y, this.local.z)
    pos.needsUpdate = true
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
    pick.world.copy(world)
    if (!this.transform.dragging) this.nodeAnchor.position.copy(world)
    this.syncNodeMarker()
  }

  private refreshNodeOverlay(): void {
    this.nodeCamKey = ''
    if (this.tool !== 'points' && this.tool !== 'cut') {
      this.nodeCloud.visible = false
      this.nodePool = []
      this.nodeShadeNrms = []
      this.nodeShadeMesh = []
      this.nodeShadeIndex = []
      return
    }
    const meshes: THREE.Mesh[] = []
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      if (this.tool !== 'cut' && this.selectedId && child.userData.partId !== this.selectedId) return
      meshes.push(child)
    })
    let total = 0
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position')
      if (pos) total += pos.count
    }
    const step = Math.max(1, Math.ceil(total / NODE_POOL_MAX))
    const pool: typeof this.nodePool = []
    const seen = new Map<number, number>()
    const nmat = new THREE.Matrix3()
    const take = (mesh: THREE.Mesh, i: number, nor: THREE.BufferAttribute | null): boolean => {
      const pos = mesh.geometry.getAttribute('position')
      if (!pos) return true
      this.tmp.fromBufferAttribute(pos, i)
      this.world.copy(this.tmp).applyMatrix4(mesh.matrixWorld)
      const key =
        ((Math.round(this.world.x * 250) * 73856093) ^
          (Math.round(this.world.y * 250) * 19349663) ^
          (Math.round(this.world.z * 250) * 83492791)) >>>
        0
      if (nor) {
        this.nrm.fromBufferAttribute(nor, i)
        this.nrm.applyMatrix3(nmat).normalize()
      } else {
        this.nrm.set(0, 1, 0)
      }
      const existing = seen.get(key)
      if (existing != null) {
        if (pool[existing].nrms.length < 6) {
          pool[existing].nrms.push(this.nrm.x, this.nrm.y, this.nrm.z)
        }
        return true
      }
      if (pool.length >= NODE_POOL_MAX) return false
      seen.set(key, pool.length)
      pool.push({
        wx: this.world.x,
        wy: this.world.y,
        wz: this.world.z,
        nrms: [this.nrm.x, this.nrm.y, this.nrm.z],
        mesh,
        index: i,
      })
      return true
    }
    outer: for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position')
      if (!pos) continue
      if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals()
      const nor = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute | null
      mesh.updateMatrixWorld(true)
      nmat.getNormalMatrix(mesh.matrixWorld)
      for (let i = 0; i < pos.count; i += step) {
        if (!take(mesh, i, nor)) break outer
      }
    }
    this.nodePool = pool
    this.nodeCloud.geometry.dispose()
    if (!pool.length) {
      this.nodeShadeNrms = []
      this.nodeShadeMesh = []
      this.nodeShadeIndex = []
      this.nodeCloud.geometry = new THREE.BufferGeometry()
      this.nodeCloud.visible = false
      this.syncNodeMarker()
      return
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(NODE_CLOUD_MAX * 3, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(NODE_CLOUD_MAX * 3, 3))
    geometry.setDrawRange(0, 0)
    this.nodeCloud.geometry = geometry
    this.nodeCloud.visible = true
    this.updateNodeOverlayView(true)
    this.syncNodeMarker()
  }

  private updateNodeOverlayView(force = false): void {
    if ((this.tool !== 'points' && this.tool !== 'cut') || !this.nodePool.length || !this.nodeCloud.visible) return
    const p = this.camera.position
    const q = this.camera.quaternion
    const camKey = `${p.x.toFixed(2)}_${p.y.toFixed(2)}_${p.z.toFixed(2)}_${q.x.toFixed(2)}_${q.y.toFixed(2)}_${q.z.toFixed(2)}_${this.renderer.domElement.clientWidth}`
    if (!force && camKey === this.nodeCamKey) return
    this.nodeCamKey = camKey
    const posAttr = this.nodeCloud.geometry.getAttribute('position')
    const colAttr = this.nodeCloud.geometry.getAttribute('color')
    if (!(posAttr instanceof THREE.BufferAttribute) || !(colAttr instanceof THREE.BufferAttribute)) return
    const w = this.renderer.domElement.clientWidth || 640
    const h = this.renderer.domElement.clientHeight || 480
    const dist = this.camera.position.distanceTo(this.orbit.target)
    const cell = Math.min(14, Math.max(4.2, 4 + dist * 1.6))
    const cellX = Math.max((cell / w) * 2, 1e-4)
    const cellY = Math.max((cell / h) * 2, 1e-4)
    const occupied = new Set<number>()
    const shadeNrms: number[][] = []
    const shadeMesh: THREE.Mesh[] = []
    const shadeIndex: number[] = []
    let n = 0
    for (const item of this.nodePool) {
      this.local.set(item.wx, item.wy, item.wz).project(this.camera)
      if (this.local.z < -1 || this.local.z > 1) continue
      if (this.local.x < -1.12 || this.local.x > 1.12 || this.local.y < -1.12 || this.local.y > 1.12) continue
      const occ =
        (Math.floor((this.local.x + 1) / cellX) * 4099) ^ Math.floor((this.local.y + 1) / cellY)
      if (occupied.has(occ)) continue
      this.world.set(
        this.camera.position.x - item.wx,
        this.camera.position.y - item.wy,
        this.camera.position.z - item.wz,
      )
      let facing = false
      for (let k = 0; k < item.nrms.length; k += 3) {
        this.nrm.set(item.nrms[k], item.nrms[k + 1], item.nrms[k + 2])
        if (this.nrm.dot(this.world) > 0) {
          facing = true
          break
        }
      }
      if (!facing) continue
      occupied.add(occ)
      posAttr.setXYZ(n, item.wx, item.wy, item.wz)
      colAttr.setXYZ(n, NODE_FRONT_RGB[0], NODE_FRONT_RGB[1], NODE_FRONT_RGB[2])
      shadeNrms.push(item.nrms)
      shadeMesh.push(item.mesh)
      shadeIndex.push(item.index)
      n += 1
      if (n >= NODE_CLOUD_MAX) break
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    this.nodeCloud.geometry.setDrawRange(0, n)
    this.nodeShadeNrms = shadeNrms
    this.nodeShadeMesh = shadeMesh
    this.nodeShadeIndex = shadeIndex
  }

  private nodeOccluded(world: THREE.Vector3): boolean {
    this.nrm.copy(world).sub(this.camera.position)
    const dist = this.nrm.length()
    if (dist < 1e-4) return false
    this.nrm.multiplyScalar(1 / dist)
    this.raycaster.set(this.camera.position, this.nrm)
    this.raycaster.far = dist - Math.max(0.018, dist * 0.02)
    const hit = this.raycaster.intersectObject(this.modelRoot, true)[0]
    this.raycaster.far = Infinity
    return Boolean(hit)
  }

  private syncNodeMarker(): void {
    const pick = this.transform.dragging ? this.nodeSel : (this.nodeHover ?? this.nodeSel)
    if ((this.tool !== 'points' && this.tool !== 'cut') || !pick) {
      this.nodeMarker.visible = false
      return
    }
    this.nodeMarker.visible = true
    this.nodeMarker.position.copy(pick.world)
    this.updateNodeMarkerScale()
  }

  private updateNodeMarkerScale(): void {
    if (!this.nodeMarker.visible) return
    const dist = this.camera.position.distanceTo(this.nodeMarker.position)
    this.nodeMarker.scale.setScalar(Math.max(0.018, dist * 0.012))
  }

  private sculpt(hit: THREE.Intersection): void {
    const child = this.sculptTarget
    if (!child) return
    const radius = this.brushRadius
    const strength = this.brushStrength
    const hitPoint = hit.point
    const inflate = this.tool === 'inflate'
    const step = (inflate ? 0.11 : 0.16) * strength
    const geo = child.geometry
    const pos = geo.getAttribute('position')
    if (!pos) return
    if (!geo.userData.unique) {
      child.geometry = geo.clone()
      child.geometry.userData.unique = true
    }
    const work = child.geometry
    const workPos = work.getAttribute('position')
    const nor = work.getAttribute('normal')
    if (!workPos) return
    child.updateMatrixWorld(true)
    this.inv.copy(child.matrixWorld).invert()

    const nearby: { i: number; world: THREE.Vector3; w: number }[] = []
    for (let i = 0; i < workPos.count; i++) {
      this.tmp.fromBufferAttribute(workPos, i)
      this.world.copy(this.tmp).applyMatrix4(child.matrixWorld)
      const dist = this.world.distanceTo(hitPoint)
      if (dist > radius) continue
      const w = (1 - dist / radius) ** 2
      if (inflate) {
        if (nor) this.nrm.fromBufferAttribute(nor, i)
        else this.nrm.set(0, 1, 0)
        this.nrm.transformDirection(child.matrixWorld).normalize()
        this.world.addScaledVector(this.nrm, step * w)
        this.local.copy(this.world).applyMatrix4(this.inv)
        workPos.setXYZ(i, this.local.x, this.local.y, this.local.z)
      } else {
        nearby.push({ i, world: this.world.clone(), w })
      }
    }

    if (!inflate && nearby.length > 1) {
      const centroid = new THREE.Vector3()
      let weight = 0
      for (const item of nearby) {
        centroid.addScaledVector(item.world, item.w)
        weight += item.w
      }
      centroid.multiplyScalar(1 / Math.max(weight, 1e-5))
      for (const item of nearby) {
        item.world.lerp(centroid, step * item.w)
        this.local.copy(item.world).applyMatrix4(this.inv)
        workPos.setXYZ(item.i, this.local.x, this.local.y, this.local.z)
      }
    }

    workPos.needsUpdate = true
    work.computeVertexNormals()
  }

  private refreshKnifeEdges(): void {
    for (const child of [...this.knife.children]) {
      if (!child.userData.knifeEdge) continue
      this.knife.remove(child)
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.knife.geometry),
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 }),
    )
    edges.userData.knifeEdge = true
    this.knife.add(edges)
  }
}

function cloneMaterial(mat: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(mat)) return mat.map((item) => item.clone())
  return mat.clone()
}

function geodesicOnMesh(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position')
  if (!pos || pos.count < 3) return [from.clone(), to.clone()]
  mesh.updateMatrixWorld(true)
  const tmp = new THREE.Vector3()
  const keyToId = new Map<string, number>()
  const points: THREE.Vector3[] = []
  const idOf = (i: number) => {
    tmp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
    const key = `${tmp.x.toFixed(4)},${tmp.y.toFixed(4)},${tmp.z.toFixed(4)}`
    let id = keyToId.get(key)
    if (id === undefined) {
      id = points.length
      keyToId.set(key, id)
      points.push(tmp.clone())
    }
    return id
  }
  const adj: number[][] = []
  const link = (a: number, b: number) => {
    if (a === b) return
    if (!adj[a]) adj[a] = []
    if (!adj[b]) adj[b] = []
    if (!adj[a].includes(b)) adj[a].push(b)
    if (!adj[b].includes(a)) adj[b].push(a)
  }
  const index = mesh.geometry.getIndex()
  if (index) {
    for (let t = 0; t + 2 < index.count; t += 3) {
      const a = idOf(index.getX(t))
      const b = idOf(index.getX(t + 1))
      const c = idOf(index.getX(t + 2))
      link(a, b)
      link(b, c)
      link(c, a)
    }
  } else {
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const a = idOf(t)
      const b = idOf(t + 1)
      const c = idOf(t + 2)
      link(a, b)
      link(b, c)
      link(c, a)
    }
  }
  if (!points.length) return [from.clone(), to.clone()]
  const nearest = (p: THREE.Vector3) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = points[i].distanceToSquared(p)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }
  const start = nearest(from)
  const goal = nearest(to)
  if (start === goal) return [from.clone(), to.clone()]
  const n = points.length
  const gScore = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const heap: number[] = []
  const heapF: number[] = []
  const push = (i: number, f: number) => {
    heap.push(i)
    heapF.push(f)
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heapF[p] <= heapF[k]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      ;[heapF[p], heapF[k]] = [heapF[k], heapF[p]]
      k = p
    }
  }
  const pop = () => {
    const i = heap[0]
    const lastI = heap.pop()
    const lastF = heapF.pop()
    if (!heap.length || lastI == null || lastF == null) return i
    heap[0] = lastI
    heapF[0] = lastF
    let k = 0
    for (;;) {
      const l = k * 2 + 1
      const r = l + 1
      let s = k
      if (l < heap.length && heapF[l] < heapF[s]) s = l
      if (r < heap.length && heapF[r] < heapF[s]) s = r
      if (s === k) break
      ;[heap[k], heap[s]] = [heap[s], heap[k]]
      ;[heapF[k], heapF[s]] = [heapF[s], heapF[k]]
      k = s
    }
    return i
  }
  gScore[start] = 0
  push(start, points[start].distanceTo(points[goal]))
  let steps = 0
  const limit = Math.min(80_000, n * 8)
  while (heap.length && steps < limit) {
    steps += 1
    const current = pop()
    if (closed[current]) continue
    closed[current] = 1
    if (current === goal) break
    const neighbours = adj[current]
    if (!neighbours) continue
    const base = gScore[current]
    for (const next of neighbours) {
      if (closed[next]) continue
      const tentative = base + points[current].distanceTo(points[next])
      if (tentative >= gScore[next]) continue
      came[next] = current
      gScore[next] = tentative
      push(next, tentative + points[next].distanceTo(points[goal]))
    }
  }
  if (came[goal] < 0 && start !== goal) return [from.clone(), to.clone()]
  const chain: THREE.Vector3[] = [to.clone()]
  let cur = goal
  const guard = n + 2
  let hops = 0
  while (cur !== start && hops < guard) {
    hops += 1
    chain.push(points[cur].clone())
    cur = came[cur]
    if (cur < 0) return [from.clone(), to.clone()]
  }
  chain.push(points[start].clone())
  chain.push(from.clone())
  chain.reverse()
  return chain
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
}

function labelToId(label: string, fallback: string): string {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return id || fallback
}

function triangleBarycentric(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): {
  u: number
  v: number
  w: number
} {
  const v0x = b.x - a.x
  const v0y = b.y - a.y
  const v0z = b.z - a.z
  const v1x = c.x - a.x
  const v1y = c.y - a.y
  const v1z = c.z - a.z
  const v2x = p.x - a.x
  const v2y = p.y - a.y
  const v2z = p.z - a.z
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z
  const d01 = v0x * v1x + v0y * v1y + v0z * v1z
  const d11 = v1x * v1x + v1y * v1y + v1z * v1z
  const d20 = v0x * v2x + v0y * v2y + v0z * v2z
  const d21 = v1x * v2x + v1y * v2y + v1z * v2z
  const denom = d00 * d11 - d01 * d01
  if (Math.abs(denom) < 1e-12) return { u: 1 / 3, v: 1 / 3, w: 1 / 3 }
  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  const u = 1 - v - w
  return { u, v, w }
}

function appendInterpolatedVertex(
  geo: THREE.BufferGeometry,
  ia: number,
  ib: number,
  ic: number,
  bary: { u: number; v: number; w: number },
): number {
  const pos = geo.getAttribute('position')
  const newIndex = pos.count
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name)
    if (!(attr instanceof THREE.BufferAttribute)) continue
    const item = attr.itemSize
    const Ctor = attr.array.constructor as new (length: number) => typeof attr.array
    const next = new Ctor(attr.array.length + item)
    next.set(attr.array as ArrayLike<number> as typeof attr.array)
    const offset = attr.array.length
    const integer = name === 'skinIndex' || attr.array instanceof Uint8Array || attr.array instanceof Uint16Array
    for (let k = 0; k < item; k++) {
      const va = attr.getComponent(ia, k)
      const vb = attr.getComponent(ib, k)
      const vc = attr.getComponent(ic, k)
      next[offset + k] = integer ? va : va * bary.u + vb * bary.v + vc * bary.w
    }
    geo.setAttribute(name, new THREE.BufferAttribute(next, item, attr.normalized))
  }
  return newIndex
}

function splitIndexedTriangle(
  geo: THREE.BufferGeometry,
  base: number,
  ia: number,
  ib: number,
  ic: number,
  n: number,
): void {
  const src = geo.index
  if (!src) return
  const extra = 6
  const IndexArray = src.count + extra > 65535 ? Uint32Array : (src.array.constructor as Uint16ArrayConstructor)
  const next = new IndexArray(src.count + extra)
  next.set(src.array.subarray(0, base) as ArrayLike<number> as typeof next, 0)
  next[base] = ia
  next[base + 1] = ib
  next[base + 2] = n
  next[base + 3] = ib
  next[base + 4] = ic
  next[base + 5] = n
  next[base + 6] = ic
  next[base + 7] = ia
  next[base + 8] = n
  next.set(src.array.subarray(base + 3) as ArrayLike<number> as typeof next, base + 9)
  geo.setIndex(new THREE.BufferAttribute(next, 1))
  for (const group of geo.groups) {
    const end = group.start + group.count
    if (end <= base) continue
    if (group.start > base) group.start += extra
    else group.count += extra
  }
}

function isFiniteBox(box: THREE.Box3): boolean {
  return (
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  )
}

function materialsHaveTexture(mat: unknown): boolean {
  const list = Array.isArray(mat) ? mat : mat ? [mat] : []
  return list.some((item) => {
    if (!item || typeof item !== 'object') return false
    const rec = item as Record<string, unknown>
    return Boolean(
      rec.map ||
        rec.normalMap ||
        rec.roughnessMap ||
        rec.metalnessMap ||
        rec.emissiveMap ||
        rec.aoMap ||
        rec.alphaMap ||
        rec.bumpMap ||
        rec.displacementMap,
    )
  })
}

function makePlainMaterials(mat: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(mat)) return mat.map((item) => makePlainMaterial(item))
  return makePlainMaterial(mat)
}

function makePlainMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
  const color =
    'color' in mat && mat.color instanceof THREE.Color ? mat.color.getHex() : 0xc47a4a
  const vertexColors = 'vertexColors' in mat ? Boolean(mat.vertexColors) : false
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.05,
    side: THREE.DoubleSide,
    vertexColors,
  })
}

function cloneMatSlot(mat: unknown): unknown {
  if (Array.isArray(mat)) return mat.map((item) => (item instanceof THREE.Material ? item.clone() : item))
  if (mat instanceof THREE.Material) return mat.clone()
  return mat
}

function disposeMats(mat: unknown): void {
  const list = Array.isArray(mat) ? mat : mat ? [mat] : []
  for (const item of list) {
    if (item instanceof THREE.Material) item.dispose()
  }
}

function guessShape(mesh: THREE.Mesh): PartShape {
  const geo = mesh.geometry
  if (!geo.boundingBox) geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return 'box'
  const size = box.getSize(new THREE.Vector3())
  const max = Math.max(size.x, size.y, size.z, 1e-5)
  const nx = size.x / max
  const ny = size.y / max
  const nz = size.z / max
  if (nx > 0.72 && ny > 0.72 && nz > 0.72) return 'sphere'
  if (ny > 0.72 && nx < 0.55 && nz < 0.55) return 'capsule'
  if (ny > 0.72 && Math.abs(nx - nz) < 0.2) return 'cylinder'
  return 'box'
}

function deepCloneGroup(root: THREE.Group): THREE.Group {
  const clone = root.clone(true)
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry = object.geometry.clone()
    object.userData = { ...object.userData }
    object.userData.fileMat = cloneMatSlot(object.userData.fileMat)
    object.userData.plainMat = cloneMatSlot(object.userData.plainMat)
    if (Array.isArray(object.material)) {
      object.material = object.material.map((mat) => mat.clone())
    } else if (object.material) {
      object.material = object.material.clone()
    }
  })
  return clone
}

function disposeGroup(group?: THREE.Group): void {
  if (!group) return
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    disposeMats(object.material)
    if (object.userData.fileMat !== object.material) disposeMats(object.userData.fileMat)
    if (object.userData.plainMat !== object.material) disposeMats(object.userData.plainMat)
  })
}
