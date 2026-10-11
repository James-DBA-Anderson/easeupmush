import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { FigureKind } from '../lib/types'
import { buildFigure } from './figures'

type Props = {
  figure: FigureKind
}

export function CharacterStage({ figure }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a140f)
    scene.fog = new THREE.Fog(0x1a140f, 6, 14)

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
    camera.position.set(1.6, 1.35, 3.2)
    camera.lookAt(0, 0.95, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2a1c, 0.85))
    const key = new THREE.DirectionalLight(0xfff1dd, 1.15)
    key.position.set(2.2, 4.2, 2.4)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x7ad7ff, 0.35)
    rim.position.set(-2.4, 1.6, -1.8)
    scene.add(rim)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 40),
      new THREE.MeshStandardMaterial({
        color: 0x2a2118,
        roughness: 1,
        metalness: 0,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.92, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffb454,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    scene.add(ring)

    const model = buildFigure(figure)
    // Game canvas is CSS-flipped; un-mirror jacket/hat prints here.
    model.scale.x *= -1
    scene.add(model)

    const clock = new THREE.Clock()
    let frame = 0

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w < 2 || h < 2) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      model.rotation.y = Math.sin(t * 0.35) * 0.35
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of mats) mat.dispose()
        }
      })
    }
  }, [figure])

  return <div className="stage-host" ref={hostRef} />
}
