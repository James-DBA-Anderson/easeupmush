import Phaser from "phaser";

export type KeyPromptHandle = {
  root: Phaser.GameObjects.Container;
  destroy: () => void;
};

/**
 * Full-screen card with a message + a real button so mobile (and desktop
 * click) can advance without relying on a keyboard.
 */
export function makeKeyPrompt(
  scene: Phaser.Scene,
  opts: {
    message: string;
    buttonLabel: string;
    onPress: () => void;
    depth?: number;
  },
): KeyPromptHandle {
  const depth = opts.depth ?? 300;
  const card = scene.add
    .text(0, -48, opts.message, {
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      fontSize: "24px",
      color: "#1a1410",
      backgroundColor: "#f2e6d8",
      padding: { x: 18, y: 14 },
      align: "center",
    })
    .setOrigin(0.5);

  const btn = scene.add
    .text(0, card.height * 0.5 + 8, opts.buttonLabel, {
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      fontSize: "22px",
      color: "#1a1410",
      backgroundColor: "#ffe08a",
      padding: { x: 28, y: 12 },
      align: "center",
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#ffd060" }));
  btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#ffe08a" }));
  btn.on("pointerup", () => opts.onPress());

  const root = scene.add.container(0, 0, [card, btn]).setDepth(depth);
  return {
    root,
    destroy: () => {
      root.destroy(true);
    },
  };
}

/** Compact bottom hint button (Casey chat continue, etc.). */
export function makeContinueButton(
  scene: Phaser.Scene,
  opts: {
    label: string;
    onPress: () => void;
    depth?: number;
  },
): KeyPromptHandle {
  const depth = opts.depth ?? 320;
  const btn = scene.add
    .text(0, 0, opts.label, {
      fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
      fontSize: "18px",
      color: "#1a1410",
      backgroundColor: "#ffe08a",
      padding: { x: 18, y: 10 },
      align: "center",
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#ffd060" }));
  btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#ffe08a" }));
  btn.on("pointerup", () => opts.onPress());

  const root = scene.add.container(0, 0, [btn]).setDepth(depth);
  return {
    root,
    destroy: () => {
      root.destroy(true);
    },
  };
}
