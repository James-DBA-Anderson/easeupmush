import * as THREE from 'three';

const LIFE = 2.6;

/** A word balloon that pops up over someone's head, drifts and fades. */
export class Grumble {
  private scene: THREE.Scene;
  private sprite: THREE.Sprite;
  private life = LIFE;

  constructor(scene: THREE.Scene, text: string, at: THREE.Vector3) {
    this.scene = scene;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: Grumble.draw(text),
        transparent: true,
        depthTest: false,
      }),
    );
    this.sprite.scale.set(2.2, 0.55, 1);
    this.sprite.position.copy(at);
    this.sprite.renderOrder = 5;
    scene.add(this.sprite);
  }

  private static draw(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shrink the lettering until the longer lines fit inside the balloon.
    const room = canvas.width - 70;
    let size = 56;
    do {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > room && size > 22);

    const width = Math.min(canvas.width - 16, ctx.measureText(text).width + 56);
    const left = (canvas.width - width) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = 'rgba(30,30,36,0.85)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(left, 10, width, 78, 22);
    ctx.fill();
    ctx.stroke();

    // Tail pointing down at whoever is doing the complaining.
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 18, 86);
    ctx.lineTo(canvas.width / 2, 122);
    ctx.lineTo(canvas.width / 2 + 18, 86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#22222a';
    ctx.fillText(text, canvas.width / 2, 50);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  /** Returns false once it has faded and cleaned itself up. */
  public update(delta: number, at: THREE.Vector3): boolean {
    this.life -= delta;
    if (this.life <= 0) {
      this.dispose();
      return false;
    }

    const age = LIFE - this.life;
    this.sprite.position.copy(at).add(new THREE.Vector3(0, 2.05 + age * 0.22, 0));

    const material = this.sprite.material as THREE.SpriteMaterial;
    // Pops out quickly, holds, then fades over the last half second.
    const pop = Math.min(1, age / 0.12);
    material.opacity = Math.min(pop, Math.min(1, this.life / 0.5));
    this.sprite.scale.set(2.2 * (0.7 + pop * 0.3), 0.55 * (0.7 + pop * 0.3), 1);
    return true;
  }

  public dispose(): void {
    this.scene.remove(this.sprite);
    const material = this.sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
