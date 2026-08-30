import * as THREE from 'three';
import type { SkyState } from './DayCycle';
import { Clouds } from './Clouds';

export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'drizzle' | 'downpour';

interface Preset {
  label: string;
  /** How far the sky and lights get knocked back. */
  gloom: number;
  fogNear: number;
  fogFar: number;
  rain: number;
  /** How much of the sky has cloud in it. */
  cover: number;
}

const PRESETS: Record<WeatherKind, Preset> = {
  clear: { label: 'Clear', gloom: 0, fogNear: 240, fogFar: 560, rain: 0, cover: 0.12 },
  cloudy: { label: 'Cloudy', gloom: 0.18, fogNear: 200, fogFar: 480, rain: 0, cover: 0.5 },
  overcast: { label: 'Overcast', gloom: 0.36, fogNear: 150, fogFar: 400, rain: 0, cover: 0.95 },
  drizzle: { label: 'Drizzle', gloom: 0.48, fogNear: 110, fogFar: 320, rain: 0.45, cover: 1 },
  downpour: { label: 'Chucking it down', gloom: 0.66, fogNear: 60, fogFar: 220, rain: 1, cover: 1 },
};

/** Rough British ordering — the weather drifts to a neighbour, it doesn't jump. */
const ORDER: readonly WeatherKind[] = ['clear', 'cloudy', 'overcast', 'drizzle', 'downpour'];

const RAIN_COUNT = 4000;
const RAIN_BOX = 90;
const RAIN_TOP = 34;

export class Weather {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private display: HTMLElement;

  private kind: WeatherKind = 'cloudy';
  private next: WeatherKind = 'cloudy';
  /** 0 means fully on the old weather, 1 fully on the new one. */
  private blend = 1;
  private holdFor = 40;
  private held = 0;

  private rain: THREE.LineSegments;
  private rainSpeeds: Float32Array;
  private wind = new THREE.Vector2(4, 1.5);
  private clouds: Clouds;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, display: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.display = display;

    // Two vertices per drop: rain reads as streaks, not dots.
    const positions = new Float32Array(RAIN_COUNT * 6);
    this.rainSpeeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainSpeeds[i] = 26 + Math.random() * 22;
      this.seedDrop(positions, i, Math.random() * RAIN_TOP);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xcfe4f2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.clouds = new Clouds(scene);

    this.showLabel();
  }

  /** Places one streak, top vertex then bottom vertex. */
  private seedDrop(array: Float32Array, i: number, top: number): void {
    const x = (Math.random() - 0.5) * RAIN_BOX;
    const z = (Math.random() - 0.5) * RAIN_BOX;
    const length = 0.6 + Math.random() * 0.7;
    const base = i * 6;
    array[base] = x;
    array[base + 1] = top;
    array[base + 2] = z;
    array[base + 3] = x - 0.08;
    array[base + 4] = top - length;
    array[base + 5] = z - 0.03;
  }

  private preset(kind: WeatherKind): Preset {
    return PRESETS[kind];
  }

  private mix(key: 'gloom' | 'fogNear' | 'fogFar' | 'rain' | 'cover'): number {
    return THREE.MathUtils.lerp(this.preset(this.kind)[key], this.preset(this.next)[key], this.blend);
  }

  private showLabel(): void {
    this.display.textContent = this.preset(this.blend > 0.5 ? this.next : this.kind).label;
  }

  private roll(): void {
    const at = ORDER.indexOf(this.next);
    const step = Math.random() < 0.5 ? -1 : 1;
    const drift = Math.random() < 0.3 ? step * 2 : step;
    const target = THREE.MathUtils.clamp(at + drift, 0, ORDER.length - 1);
    this.kind = this.next;
    this.next = ORDER[target]!;
    this.blend = 0;
    this.held = 0;
    this.holdFor = 45 + Math.random() * 90;
  }

  public update(delta: number, sky: SkyState): void {
    this.held += delta;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + delta / 12);
    } else if (this.held >= this.holdFor) {
      this.roll();
    }
    this.showLabel();

    this.applySky(sky);
    this.stepRain(delta);
    this.driftClouds(delta, sky);
  }

  /** True once there's enough rain about to make you squint. */
  public isWet(): boolean {
    return this.mix('rain') > 0.15;
  }

  /** How much the lights should be knocked back for the current weather. */
  public get gloom(): number {
    return this.mix('gloom');
  }

  private applySky(sky: SkyState): void {
    const gloom = this.mix('gloom');
    // Grey the sky out rather than just darkening it — overcast is pale, not black.
    const grey = new THREE.Color(0x8f9aa2);
    const skyColor = sky.sky.clone().lerp(grey, gloom).multiplyScalar(1 - gloom * 0.35);

    this.scene.background = skyColor;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(skyColor);
    fog.near = this.mix('fogNear');
    fog.far = this.mix('fogFar');
  }

  /** Clouds ride the same wind as the rain, only slower and much higher up. */
  private driftClouds(delta: number, sky: SkyState): void {
    // Daylight washed with whatever colour the sun is: white at noon, orange
    // at dusk, near enough black in the middle of the night.
    const daylight = THREE.MathUtils.clamp(sky.ambient + sky.sun * 0.5, 0.16, 1);
    const light = sky.sunColor
      .clone()
      .lerp(new THREE.Color(0xffffff), 0.45)
      .multiplyScalar(daylight);

    this.clouds.update(
      delta,
      this.wind,
      this.camera.position,
      this.mix('cover'),
      this.mix('gloom'),
      light,
    );
  }

  private stepRain(delta: number): void {
    const intensity = this.mix('rain');
    const material = this.rain.material as THREE.LineBasicMaterial;
    material.opacity = intensity * 0.6;
    this.rain.visible = intensity > 0.01;
    if (!this.rain.visible) return;

    this.rain.geometry.setDrawRange(0, Math.floor(RAIN_COUNT * intensity) * 2);
    // The rain box rides along with the player so it never runs out.
    this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);

    const positions = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const base = i * 6;
      const drop = (this.rainSpeeds[i] ?? 30) * delta;
      if ((array[base + 4] ?? 0) < 0) {
        this.seedDrop(array, i, RAIN_TOP);
        continue;
      }
      const driftX = this.wind.x * delta;
      const driftZ = this.wind.y * delta;
      for (const vertex of [base, base + 3]) {
        array[vertex] = (array[vertex] ?? 0) + driftX;
        array[vertex + 1] = (array[vertex + 1] ?? 0) - drop;
        array[vertex + 2] = (array[vertex + 2] ?? 0) + driftZ;
      }
    }
    positions.needsUpdate = true;
  }
}
