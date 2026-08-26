import Phaser from "phaser";

export type ReactKind = "wince" | "cheer" | "stamp" | "loss";

const ME_LUNGE = 20;
const FOE_LUNGE = -20;

/** Attacker hops in, contact callback, then hops back. */
export function attackLunge(
  scene: Phaser.Scene,
  spr: Phaser.GameObjects.Image | undefined,
  towardFoe: boolean,
  onContact?: () => void,
): void {
  if (!spr) {
    onContact?.();
    return;
  }
  const ox = spr.x;
  const oy = spr.y;
  const dx = towardFoe ? ME_LUNGE : FOE_LUNGE;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, oy);
  scene.tweens.add({
    targets: spr,
    x: ox + dx,
    y: oy - 3,
    duration: 95,
    ease: "Quad.easeOut",
    onComplete: () => {
      onContact?.();
      scene.tweens.add({
        targets: spr,
        x: ox,
        y: oy,
        duration: 120,
        ease: "Quad.easeIn",
      });
    },
  });
}

/** Short lunge that never quite connects. */
export function attackMiss(
  scene: Phaser.Scene,
  spr: Phaser.GameObjects.Image | undefined,
  towardFoe: boolean,
): void {
  if (!spr) return;
  const ox = spr.x;
  const oy = spr.y;
  const dx = towardFoe ? ME_LUNGE * 0.55 : FOE_LUNGE * 0.55;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, oy);
  scene.tweens.add({
    targets: spr,
    x: ox + dx,
    duration: 80,
    yoyo: true,
    ease: "Sine.easeOut",
  });
  puff(scene, ox + dx * 1.4, oy - 20, 0xd0e0f0);
}

/** Defender flash, knock, sparks. */
export function hitImpact(
  scene: Phaser.Scene,
  spr: Phaser.GameObjects.Image | undefined,
  knockLeft: boolean,
  shake = false,
): void {
  if (!spr) return;
  const ox = spr.x;
  const oy = spr.y;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, oy);
  spr.setAlpha(1);
  spr.setTint(0xff7068);
  scene.time.delayedCall(110, () => spr.clearTint());
  scene.tweens.add({
    targets: spr,
    alpha: 0.25,
    duration: 55,
    yoyo: true,
    repeat: 2,
  });
  scene.tweens.add({
    targets: spr,
    x: ox + (knockLeft ? -8 : 8),
    duration: 50,
    yoyo: true,
    ease: "Quad.easeOut",
  });
  if (shake) scene.cameras.main.shake(130, 0.012);
  sparks(scene, spr.x, spr.y - 18);
}

/** Brace — tuck in for DEFEND. */
export function braceGuard(scene: Phaser.Scene, spr: Phaser.GameObjects.Image | undefined): void {
  if (!spr) return;
  const ox = spr.x;
  const oy = spr.y;
  const sx = spr.scaleX;
  const sy = spr.scaleY;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, oy);
  scene.tweens.add({
    targets: spr,
    scaleX: sx * 0.88,
    scaleY: sy * 1.06,
    y: oy + 2,
    duration: 90,
    yoyo: true,
    ease: "Quad.easeOut",
  });
  spr.setTint(0xb0d0ff);
  scene.time.delayedCall(160, () => spr.clearTint());
}

/** Dodge lean. */
export function dodgeLean(
  scene: Phaser.Scene,
  spr: Phaser.GameObjects.Image | undefined,
  leanLeft: boolean,
): void {
  if (!spr) return;
  const ox = spr.x;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, spr.y);
  scene.tweens.add({
    targets: spr,
    x: ox + (leanLeft ? -10 : 10),
    duration: 70,
    yoyo: true,
    hold: 40,
    ease: "Quad.easeOut",
  });
}

export function faintDrop(scene: Phaser.Scene, spr: Phaser.GameObjects.Image | undefined): void {
  if (!spr) return;
  scene.tweens.killTweensOf(spr);
  scene.tweens.add({
    targets: spr,
    y: spr.y + 10,
    alpha: 0.15,
    duration: 280,
    ease: "Quad.easeIn",
  });
}

/** Trainer chucks the next mon in — hop, ball, pop. */
export function trainerDeploy(
  scene: Phaser.Scene,
  trainer: Phaser.GameObjects.Sprite | undefined,
  mon: Phaser.GameObjects.Image | undefined,
  rest: { x: number; y: number },
  texture: string,
  onLand?: () => void,
): void {
  const land = (): void => {
    if (!mon) {
      onLand?.();
      return;
    }
    scene.tweens.killTweensOf(mon);
    mon.setTexture(texture);
    mon.clearTint();
    mon.setFlipX(false);
    mon.setAlpha(1);
    mon.setScale(0.2);
    mon.setPosition(rest.x, rest.y);
    puff(scene, rest.x, rest.y - 18, 0xf0a23a);
    scene.tweens.add({
      targets: mon,
      scale: 2,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        mon.setScale(2);
        onLand?.();
      },
    });
  };

  if (!trainer) {
    land();
    return;
  }

  scene.tweens.killTweensOf(trainer);
  trainer.clearTint();
  trainer.setAlpha(1);
  const ox = trainer.x;
  const oy = trainer.y;
  trainer.setPosition(ox, oy);

  scene.tweens.add({
    targets: trainer,
    x: ox - 10,
    y: oy - 4,
    scaleY: trainer.scaleY * 0.92,
    duration: 90,
    yoyo: true,
    ease: "Quad.easeOut",
    onComplete: () => {
      const ball = scene.add.rectangle(ox - 6, oy - 20, 6, 6, 0xf0a23a, 1).setDepth(14);
      ball.setStrokeStyle(1, 0x1a1814);
      scene.tweens.add({
        targets: ball,
        x: rest.x,
        y: rest.y - 40,
        duration: 160,
        ease: "Quad.easeOut",
        onComplete: () => {
          scene.tweens.add({
            targets: ball,
            y: rest.y - 22,
            duration: 90,
            ease: "Quad.easeIn",
            onComplete: () => {
              ball.destroy();
              land();
            },
          });
        },
      });
    },
  });
}

/** Trainer / kid body language. */
export function actorReact(
  scene: Phaser.Scene,
  spr: Phaser.GameObjects.Sprite | undefined,
  kind: ReactKind,
): void {
  if (!spr) return;
  const ox = spr.x;
  const oy = spr.y;
  scene.tweens.killTweensOf(spr);
  spr.setPosition(ox, oy);
  spr.clearTint();

  if (kind === "wince") {
    spr.setTint(0xa8a0a0);
    scene.tweens.add({
      targets: spr,
      x: ox + 6,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => spr.clearTint(),
    });
    return;
  }
  if (kind === "cheer") {
    const sy = spr.scaleY;
    scene.tweens.add({
      targets: spr,
      scaleY: sy * 1.12,
      duration: 70,
      yoyo: true,
      repeat: 1,
      ease: "Quad.easeOut",
    });
    return;
  }
  if (kind === "stamp") {
    const sy = spr.scaleY;
    scene.tweens.add({
      targets: spr,
      scaleY: sy * 0.9,
      duration: 55,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    return;
  }
  // loss — grey, fade, slight sink
  spr.setTint(0x8890a0);
  scene.tweens.add({
    targets: spr,
    alpha: 0.55,
    y: oy + 4,
    duration: 320,
    ease: "Quad.easeIn",
  });
}

function sparks(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(30);
  g.fillStyle(0xfff8e0, 1);
  g.fillRect(x - 1, y - 1, 3, 3);
  g.fillRect(x - 9, y - 7, 2, 2);
  g.fillRect(x + 8, y - 5, 2, 2);
  g.fillRect(x - 2, y - 12, 2, 2);
  g.fillRect(x + 6, y + 3, 2, 2);
  g.fillRect(x - 8, y + 2, 2, 2);
  g.fillStyle(0xf0a23a, 1);
  g.fillRect(x - 5, y - 3, 2, 2);
  g.fillRect(x + 3, y - 8, 2, 2);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 220,
    onComplete: () => g.destroy(),
  });
}

function puff(scene: Phaser.Scene, x: number, y: number, color: number): void {
  const g = scene.add.graphics().setDepth(30);
  g.fillStyle(color, 1);
  g.fillRect(x, y, 3, 3);
  g.fillRect(x - 5, y + 2, 2, 2);
  g.fillRect(x + 4, y - 2, 2, 2);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    y: y - 6,
    duration: 180,
    onComplete: () => g.destroy(),
  });
}
