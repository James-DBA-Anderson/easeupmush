import * as THREE from "three";
import {
  PATH_Y,
  WATER_Y,
  distanceToShore,
  isInLake,
  isOnPath,
  nearestShore,
} from "../world/lake";
import { waterNormalsTexture } from "../world/waterNormals";

const MERGE = 1.15;
const ADD_PER_HIT = 0.038;
const MAX_VOLUME = 1.35;
const MAX_PUDDLES = 48;
/** Within this of the bank, puddles creep toward the lake and drain in. */
const DRAIN_RANGE = 5.5;
const EVAPORATE = 0.07;
const FLOW = 1.15;

const WATER = 0x4a8f9c;
const DEEP = 0x2a5a68;

interface Puddle {
  mesh: THREE.Mesh;
  /** Thin tongue that runs ahead when draining toward the bank. */
  stream: THREE.Mesh;
  x: number;
  z: number;
  /** 0 empty, ~1 a proper standing puddle. */
  volume: number;
  /** Path near the lake drains; inland path just dries. */
  drains: boolean;
  seed: number;
  /** Recent spray kick — fades, drives surface churn. */
  disturb: number;
  /** Flow heading in XZ while draining (for stretch). */
  flowX: number;
  flowZ: number;
}

/**
 * Standing water left by the pressure washer on the paving. Grass soaks it up;
 * paths hold it — near the lake it runs off into the pond, further out it
 * evaporates. Looks like a scrap of the lake: same tint, scrolling ripples,
 * soft edges, and it stretches as it drains.
 */
export class Puddles {
  private scene: THREE.Scene;
  private puddles: Puddle[] = [];
  private geometry: THREE.CircleGeometry;
  private streamGeo: THREE.PlaneGeometry;
  private normals: THREE.CanvasTexture;
  private shared: {
    time: { value: number };
    sunDir: { value: THREE.Vector3 };
    normalSampler: { value: THREE.Texture };
  };
  private ripples: {
    mesh: THREE.Mesh;
    life: number;
    maxLife: number;
  }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = new THREE.CircleGeometry(0.55, 28);
    this.streamGeo = new THREE.PlaneGeometry(1, 1, 1, 8);
    this.normals = waterNormalsTexture();
    this.normals.repeat.set(2.2, 2.2);
    this.shared = {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
      normalSampler: { value: this.normals },
    };
  }

  /** A jet droplet has hit the ground here. */
  public splash(point: THREE.Vector3): void {
    const x = point.x;
    const z = point.z;
    if (isInLake(x, z)) return;
    // Grass just drinks it — nothing to see.
    if (!isOnPath(x, z)) return;

    let nearest: Puddle | null = null;
    let best = MERGE * MERGE;
    for (const puddle of this.puddles) {
      const dx = puddle.x - x;
      const dz = puddle.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        nearest = puddle;
      }
    }

    if (nearest) {
      const w = nearest.volume;
      const add = ADD_PER_HIT;
      nearest.x = (nearest.x * w + x * add) / (w + add);
      nearest.z = (nearest.z * w + z * add) / (w + add);
      nearest.volume = Math.min(MAX_VOLUME, nearest.volume + add);
      nearest.drains = distanceToShore(nearest.x, nearest.z) < DRAIN_RANGE;
      nearest.disturb = Math.min(1.4, nearest.disturb + 0.55);
      this.pose(nearest);
      return;
    }

    if (this.puddles.length >= MAX_PUDDLES) {
      // Top up the smallest rather than spawning forever.
      let weak = this.puddles[0]!;
      for (const puddle of this.puddles) {
        if (puddle.volume < weak.volume) weak = puddle;
      }
      weak.x = x;
      weak.z = z;
      weak.volume = Math.min(MAX_VOLUME, weak.volume + ADD_PER_HIT * 2);
      weak.drains = distanceToShore(x, z) < DRAIN_RANGE;
      weak.disturb = Math.min(1.4, weak.disturb + 0.7);
      this.pose(weak);
      return;
    }

    const seed = Math.random() * 40;
    const mesh = new THREE.Mesh(this.geometry, this.makeWaterMat(seed));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;

    const stream = new THREE.Mesh(this.streamGeo, this.makeWaterMat(seed + 1.7));
    stream.rotation.x = -Math.PI / 2;
    stream.visible = false;
    stream.renderOrder = 2;

    const puddle: Puddle = {
      mesh,
      stream,
      x,
      z,
      volume: ADD_PER_HIT * 2.2,
      drains: distanceToShore(x, z) < DRAIN_RANGE,
      seed,
      disturb: 0.9,
      flowX: 0,
      flowZ: 0,
    };
    this.pose(puddle);
    this.scene.add(mesh, stream);
    this.puddles.push(puddle);
  }

  public update(delta: number, sunDirection?: THREE.Vector3): void {
    this.shared.time.value += delta;
    if (sunDirection) {
      this.shared.sunDir.value.copy(sunDirection).normalize();
    }

    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i]!;
      puddle.drains = distanceToShore(puddle.x, puddle.z) < DRAIN_RANGE;
      puddle.disturb = Math.max(0, puddle.disturb - delta * 1.6);

      if (puddle.drains) {
        const shore = nearestShore(puddle.x, puddle.z);
        const toLake = new THREE.Vector2(
          shore.x - puddle.x,
          shore.y - puddle.z,
        );
        const gap = toLake.length();
        if (gap > 0.05) {
          puddle.flowX = toLake.x / gap;
          puddle.flowZ = toLake.y / gap;
          toLake.multiplyScalar((FLOW * delta * (0.4 + puddle.volume)) / gap);
          puddle.x += toLake.x;
          puddle.z += toLake.y;
        }

        // Lose volume as it runs, faster once it's at the kerb.
        const nearEdge = Math.max(0.15, distanceToShore(puddle.x, puddle.z));
        const drainRate =
          puddle.volume * (0.12 + 1.2 / (nearEdge + 0.4)) * delta;
        puddle.volume -= drainRate;

        if (
          isInLake(puddle.x, puddle.z) ||
          distanceToShore(puddle.x, puddle.z) < 0.55
        ) {
          this.intoPond(puddle.x, puddle.z, puddle.volume);
          puddle.volume = 0;
        }
      } else {
        puddle.flowX *= Math.max(0, 1 - delta * 2);
        puddle.flowZ *= Math.max(0, 1 - delta * 2);
        // Inland paving — gathers, then dries off in the air.
        puddle.volume -= EVAPORATE * delta * (0.5 + puddle.volume * 0.5);
      }

      if (puddle.volume <= 0.02) {
        this.removeAt(i);
        continue;
      }
      this.pose(puddle);
    }

    this.stepRipples(delta);
  }

  private makeWaterMat(seed: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        normalSampler: this.shared.normalSampler,
        time: this.shared.time,
        sunDir: this.shared.sunDir,
        opacity: { value: 0.35 },
        depth: { value: 0.3 },
        disturb: { value: 0 },
        seed: { value: seed },
        waterColor: { value: new THREE.Color(WATER) },
        deepColor: { value: new THREE.Color(DEEP) },
      },
      vertexShader: /* glsl */ `
        uniform float time;
        uniform float seed;
        uniform float disturb;
        varying vec2 vUv;
        varying float vRadial;

        void main() {
          vUv = uv;
          vec3 p = position;
          float r = length(p.xy);
          vRadial = r / 0.55;
          if (r > 0.001) {
            float ang = atan(p.y, p.x);
            float wobble =
              0.1 * sin(ang * 2.0 + seed) +
              0.07 * sin(ang * 5.0 - seed * 1.4 + time * 0.9) +
              0.04 * sin(ang * 8.0 + seed * 0.6 - time * 1.3) +
              disturb * 0.06 * sin(ang * 6.0 + time * 7.0 + seed);
            p.xy *= 1.0 + wobble;
            // Tiny surface lift so ripples catch light.
            p.z += (sin(ang * 4.0 + time * 3.0 + seed) * 0.008
              + disturb * sin(ang * 9.0 + time * 11.0) * 0.012) * r;
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D normalSampler;
        uniform float time;
        uniform float opacity;
        uniform float depth;
        uniform float disturb;
        uniform float seed;
        uniform vec3 waterColor;
        uniform vec3 deepColor;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying float vRadial;

        void main() {
          float edge = 1.0 - smoothstep(0.55, 1.05, vRadial);
          if (edge < 0.01) discard;

          vec2 drift = vec2(time * 0.04 + seed * 0.01, time * 0.028);
          vec2 kick = disturb * vec2(
            sin(time * 5.0 + seed),
            cos(time * 4.2 - seed)
          ) * 0.08;
          vec2 uv1 = vUv * 2.4 + drift + kick;
          vec2 uv2 = vUv * 1.6 - drift * 0.7 + kick.yx;
          vec3 n1 = texture2D(normalSampler, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalSampler, uv2).xyz * 2.0 - 1.0;
          vec3 n = normalize(n1 + n2);

          float fresnel = pow(1.0 - clamp(n.z * 0.5 + 0.5, 0.0, 1.0), 1.8);
          vec3 sky = vec3(0.75, 0.86, 0.92);
          vec3 body = mix(deepColor, waterColor, 0.35 + depth * 0.45);
          vec3 col = mix(body, sky, fresnel * (0.35 + disturb * 0.2));

          vec3 light = normalize(sunDir);
          float spec = pow(max(0.0, dot(normalize(n), light)), 40.0);
          col += vec3(0.85, 0.92, 1.0) * spec * (0.35 + disturb * 0.4);

          // Soft bright rim where the wet meets dry paving.
          float rim = smoothstep(0.45, 0.85, vRadial) * (0.12 + disturb * 0.1);
          col += sky * rim;

          float alpha = opacity * edge * (0.75 + depth * 0.35);
          alpha *= 0.85 + 0.15 * sin(time * 2.0 + seed + vRadial * 6.0);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private pose(puddle: Puddle): void {
    const t = Math.min(1, puddle.volume / MAX_VOLUME);
    const breath =
      1 + Math.sin(this.shared.time.value * 2.2 + puddle.seed) * 0.03;
    const spread = (0.55 + t * 1.45) * breath;

    // Stretch along the drain path so it reads as running water, not a disc.
    const flowLen = Math.hypot(puddle.flowX, puddle.flowZ);
    const moving = puddle.drains && flowLen > 0.2;
    const stretch = moving ? 1 + t * 0.85 : 1 + puddle.disturb * 0.12;
    const across = moving ? 1 / Math.sqrt(stretch) : 1;

    const yaw = moving
      ? Math.atan2(puddle.flowX, puddle.flowZ)
      : puddle.seed * 0.2;
    puddle.mesh.rotation.set(-Math.PI / 2, 0, -yaw);
    puddle.mesh.position.set(puddle.x, PATH_Y + 0.014, puddle.z);
    puddle.mesh.scale.set(spread * across, spread * stretch, 1);

    const mat = puddle.mesh.material as THREE.ShaderMaterial;
    mat.uniforms["opacity"]!.value = 0.28 + t * 0.42;
    mat.uniforms["depth"]!.value = t;
    mat.uniforms["disturb"]!.value = puddle.disturb;

    // A rivulet reaching toward the kerb while it drains.
    if (moving && t > 0.12) {
      const reach = 0.7 + t * 1.8;
      puddle.stream.visible = true;
      puddle.stream.rotation.set(-Math.PI / 2, 0, -yaw);
      puddle.stream.position.set(
        puddle.x + puddle.flowX * reach * 0.55,
        PATH_Y + 0.011,
        puddle.z + puddle.flowZ * reach * 0.55,
      );
      puddle.stream.scale.set(spread * 0.28 * across, reach, 1);
      const sm = puddle.stream.material as THREE.ShaderMaterial;
      sm.uniforms["opacity"]!.value = 0.18 + t * 0.28;
      sm.uniforms["depth"]!.value = t * 0.7;
      sm.uniforms["disturb"]!.value = puddle.disturb * 0.6 + 0.25;
    } else {
      puddle.stream.visible = false;
    }
  }

  private intoPond(x: number, z: number, volume: number): void {
    if (volume < 0.04) return;
    const shore = nearestShore(x, z);
    // Slip a little into the water from the bank.
    const into = new THREE.Vector2(-shore.x, -shore.y).normalize();
    const px = shore.x + into.x * 0.8;
    const pz = shore.y + into.y * 0.8;
    this.ripple(px, pz, 0.25 + Math.min(0.55, volume) * 0.7);
  }

  private ripple(x: number, z: number, size: number): void {
    if (this.ripples.length > 24) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.35, size, 20),
      new THREE.MeshBasicMaterial({
        color: 0xcfe8f2,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, WATER_Y + 0.03, z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, life: 0, maxLife: 0.75 + size * 0.45 });
  }

  private stepRipples(delta: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!;
      ripple.life += delta;
      const t = ripple.life / ripple.maxLife;
      if (t >= 1) {
        this.scene.remove(ripple.mesh);
        ripple.mesh.geometry.dispose();
        (ripple.mesh.material as THREE.Material).dispose();
        this.ripples.splice(i, 1);
        continue;
      }
      ripple.mesh.scale.setScalar(1 + t * 2.6);
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity =
        0.45 * (1 - t) * (1 - t);
    }
  }

  private removeAt(i: number): void {
    const puddle = this.puddles[i]!;
    this.scene.remove(puddle.mesh, puddle.stream);
    (puddle.mesh.material as THREE.Material).dispose();
    (puddle.stream.material as THREE.Material).dispose();
    this.puddles.splice(i, 1);
  }
}
