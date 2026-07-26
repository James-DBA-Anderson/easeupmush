import Phaser from "phaser";
import { GAME_HEIGHT } from "../constants";
import {
  drawSorFighter,
  drawSorDown,
  drawDistantPerson,
  drawFisherman,
  drawContainerShip,
  drawMotorBoat,
  drawJetSki,
  drawDog,
  drawBike,
  drawScooter,
  drawWheelchair,
  type SorPose,
} from "./sorFigure";
import { POMPEY_LOOKS, type PersonLook } from "./pompeyLooks";

/** Procedural SOR2-inspired doodle textures — swap for scanned art later. */

function scratchStroke(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  color = "#1a1410",
  width = 3,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw();
  ctx.restore();
}

function wobble(n: number, amp = 2): number {
  return n + (Math.random() - 0.5) * amp;
}

export function generateDoodleTextures(scene: Phaser.Scene): void {
  // Bump this when poses/assets change so hot reload regenerates.
  const VERSION = "doodle_v18";
  if (scene.textures.exists(VERSION)) return;
  if (
    scene.textures.exists("sky") ||
    scene.textures.exists("doodle_v17") ||
    scene.textures.exists("doodle_v16") ||
    scene.textures.exists("doodle_v15") ||
    scene.textures.exists("doodle_v14") ||
    scene.textures.exists("doodle_v13") ||
    scene.textures.exists("doodle_v12") ||
    scene.textures.exists("doodle_v11") ||
    scene.textures.exists("doodle_v10") ||
    scene.textures.exists("doodle_v9") ||
    scene.textures.exists("doodle_v8") ||
    scene.textures.exists("doodle_v7") ||
    scene.textures.exists("doodle_v6") ||
    scene.textures.exists("doodle_v5") ||
    scene.textures.exists("doodle_v4") ||
    scene.textures.exists("doodle_v3")
  ) {
    for (const key of [...scene.textures.getTextureKeys()]) {
      if (
        key.startsWith("player_") ||
        key.startsWith("enemy_") ||
        key.startsWith("civ_") ||
        key.startsWith("police_") ||
        key.startsWith("look_") ||
        key.startsWith("weapon_") ||
        key.startsWith("doodle_v") ||
        key.startsWith("landmark_") ||
        key.startsWith("mount_") ||
        key.startsWith("distant_") ||
        [
          "sky",
          "clouds",
          "sea",
          "beach",
          "road",
          "common",
          "pier",
          "isle_wight",
          "car",
          "car_dent1",
          "car_dent2",
          "car_wrecked",
          "prop_bin",
          "prop_bin_green",
          "prop_bin_broken",
          "prop_bollard",
          "prop_bollard_broken",
          "prop_seagull",
          "prop_seagull_0",
          "prop_seagull_1",
          "prop_seagull_2",
          "solent_fort",
          "container_ship",
          "sea_boat",
          "sea_jetski",
          "dog",
        ].includes(key)
      ) {
        scene.textures.remove(key);
      }
    }
  }

  makeSky(scene);
  makeClouds(scene);
  makeIsleOfWight(scene);
  makeSea(scene);
  makeCommon(scene);
  makeBeach(scene);
  makeRoad(scene);
  makeSouthParadePier(scene);
  makeClarencePier(scene);
  makeSouthseaCastle(scene);
  makePyramids(scene);
  makeNavalMemorial(scene);
  makeSpinnaker(scene);
  makeSolentFort(scene);
  makeForeground(scene);
  makeCar(scene);
  makeWeapons(scene);
  makeSceneryExtras(scene);
  makeAllLookSheets(scene);
  scene.textures.createCanvas(VERSION, 2, 2)?.refresh();
}

function makeSceneryExtras(scene: Phaser.Scene): void {
  {
    const tex = scene.textures.createCanvas("container_ship", 80, 36)!;
    drawContainerShip(tex.getContext(), 80, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_boat", 72, 36)!;
    drawMotorBoat(tex.getContext(), 72, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_jetski", 56, 36)!;
    drawJetSki(tex.getContext(), 56, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_walker", 24, 36)!;
    drawDistantPerson(tex.getContext(), 24, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_fisherman", 40, 40)!;
    drawFisherman(tex.getContext(), 40, 40);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("dog", 48, 36)!;
    drawDog(tex.getContext(), 48, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_bike", 64, 48)!;
    drawBike(tex.getContext(), 64, 48);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_scooter", 56, 48)!;
    drawScooter(tex.getContext(), 56, 48);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_wheelchair", 56, 48)!;
    drawWheelchair(tex.getContext(), 56, 48);
    tex.refresh();
  }
}

function makeSky(scene: Phaser.Scene): void {
  const w = 64;
  const h = GAME_HEIGHT;
  const tex = scene.textures.createCanvas("sky", w, h)!;
  const ctx = tex.getContext();
  // Blustery Solent day — cooler, less sunset
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8eb8dc");
  g.addColorStop(0.4, "#6aa0c8");
  g.addColorStop(0.55, "#a8c4d8");
  g.addColorStop(1, "#9aab90");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
}

function makeClouds(scene: Phaser.Scene): void {
  const w = 512;
  const h = 160;
  const tex = scene.textures.createCanvas("clouds", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const blobs = [
    [40, 70, 50],
    [90, 60, 40],
    [130, 75, 45],
    [260, 50, 55],
    [310, 65, 35],
    [420, 80, 48],
    [470, 55, 30],
  ];
  for (const [x, y, r] of blobs) {
    scratchStroke(ctx, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      ctx.stroke();
    }, "#1a1410", 2);
  }
  tex.refresh();
}

function makeSea(scene: Phaser.Scene): void {
  const w = 512;
  const h = 100;
  const tex = scene.textures.createCanvas("sea", w, h)!;
  const ctx = tex.getContext();
  // Solent — grey-green chop rather than tropical blue
  ctx.fillStyle = "#3d6a7a";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#4a7a8a");
  g.addColorStop(1, "#2a4e5c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  scratchStroke(ctx, () => {
    for (let i = 0; i < 8; i++) {
      const y = 16 + i * 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 28) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * 4);
      }
      ctx.stroke();
    }
  }, "#2a4550", 2);
  scratchStroke(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(0, h - 8);
    for (let x = 0; x <= w; x += 20) {
      ctx.lineTo(x, h - 8 + Math.sin(x * 0.1) * 3);
    }
    ctx.stroke();
  }, "#c8d8e0", 3);
  tex.refresh();
}

function makeCommon(scene: Phaser.Scene): void {
  // Southsea Common — open green behind the esplanade
  const w = 512;
  const h = 90;
  const tex = scene.textures.createCanvas("common", w, h)!;
  const ctx = tex.getContext();
  ctx.fillStyle = "#6a8a4a";
  ctx.fillRect(0, 0, w, h);
  scratchStroke(ctx, () => {
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const y = 10 + Math.random() * (h - 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 6 - Math.random() * 4);
      ctx.stroke();
    }
    // faint path
    ctx.strokeStyle = "#8a9a60";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.55);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h * 0.55 + Math.sin(x * 0.02) * 4);
    }
    ctx.stroke();
  }, "#3a5030", 1.5);
  tex.refresh();
}

function makeBeach(scene: Phaser.Scene): void {
  // Southsea shingle — grey-brown pebbles, not golden sand
  const w = 512;
  const h = 280;
  const tex = scene.textures.createCanvas("beach", w, h)!;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#9a9080");
  g.addColorStop(0.35, "#8a8070");
  g.addColorStop(1, "#7a7060");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  scratchStroke(ctx, () => {
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        2 + Math.random() * 5,
        1.5 + Math.random() * 2.5,
        Math.random(),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }, "#5a5040", 1.4);
  // wetter foreshore near top (toward sea)
  scratchStroke(ctx, () => {
    ctx.fillStyle = "rgba(70,90,100,0.18)";
    ctx.fillRect(0, 0, w, 40);
  }, "#5a5040", 1);
  tex.refresh();
}

function makeRoad(scene: Phaser.Scene): void {
  const w = 256;
  const h = 72;
  const tex = scene.textures.createCanvas("road", w, h)!;
  const ctx = tex.getContext();
  ctx.fillStyle = "#3a3a40";
  ctx.fillRect(0, 0, w, h);
  // darker wear
  ctx.fillStyle = "#323238";
  ctx.fillRect(0, 18, w, h - 28);
  // centre dashes
  ctx.fillStyle = "#c8b860";
  for (let x = 8; x < w; x += 36) {
    ctx.fillRect(x, h * 0.48, 18, 3);
  }
  // kerb edge (top)
  ctx.fillStyle = "#b0a090";
  ctx.fillRect(0, 0, w, 5);
  ctx.fillStyle = "#8a8070";
  ctx.fillRect(0, 5, w, 3);
  // gutter
  ctx.fillStyle = "#2a2a30";
  ctx.fillRect(0, h - 8, w, 8);
  tex.refresh();
}

function makeIsleOfWight(scene: Phaser.Scene): void {
  const w = 420;
  const h = 70;
  const tex = scene.textures.createCanvas("isle_wight", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  // Soft distant chalk downs silhouette across the Solent
  scratchStroke(ctx, () => {
    ctx.fillStyle = "#6a8a6a";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.55);
    ctx.quadraticCurveTo(w * 0.12, h * 0.25, w * 0.22, h * 0.4);
    ctx.quadraticCurveTo(w * 0.35, h * 0.15, w * 0.48, h * 0.38);
    ctx.quadraticCurveTo(w * 0.62, h * 0.2, w * 0.75, h * 0.42);
    ctx.quadraticCurveTo(w * 0.88, h * 0.28, w, h * 0.5);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // faint cliff chalk
    ctx.strokeStyle = "#c8d4c0";
    ctx.beginPath();
    ctx.moveTo(w * 0.7, h * 0.45);
    ctx.lineTo(w * 0.78, h * 0.55);
    ctx.stroke();
  }, "#3a5038", 2);
  tex.refresh();
}

function makeSouthParadePier(scene: Phaser.Scene): void {
  // Classic Victorian pier jutting into the Solent (South Parade Pier)
  const w = 520;
  const h = 200;
  const tex = scene.textures.createCanvas("landmark_south_parade_pier", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "rgba(45,80,95,0.35)";
    ctx.fillRect(180, 110, 340, 90);

    ctx.fillStyle = "#6a4a32";
    ctx.beginPath();
    ctx.moveTo(8, 118);
    ctx.lineTo(200, 108);
    ctx.lineTo(480, 95);
    ctx.lineTo(500, 108);
    ctx.lineTo(490, 128);
    ctx.lineTo(200, 138);
    ctx.lineTo(12, 145);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const x0 = 20 + t * 460;
      const y0 = 120 - t * 12;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 8, y0 + 18);
      ctx.stroke();
    }

    ctx.fillStyle = "#3a3030";
    for (const lx of [220, 300, 380, 450]) {
      ctx.fillRect(lx, 125, 10, 70);
      ctx.strokeRect(lx, 125, 10, 70);
      ctx.beginPath();
      ctx.moveTo(lx - 8, 195);
      ctx.lineTo(lx + 18, 195);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(40, 112);
    ctx.lineTo(490, 92);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      const x = 50 + t * 430;
      const y = 112 - t * 18;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
    }

    // Pavilion with cream / red seaside trim
    ctx.fillStyle = "#c45c4a";
    ctx.fillRect(430, 48, 70, 50);
    ctx.strokeRect(430, 48, 70, 50);
    ctx.fillStyle = "#e8d080";
    ctx.beginPath();
    ctx.moveTo(420, 52);
    ctx.lineTo(465, 28);
    ctx.lineTo(510, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(445, 30);
    ctx.lineTo(445, 18);
    ctx.lineTo(458, 22);
    ctx.lineTo(445, 24);
    ctx.stroke();
  }, "#1a1410", 3);

  tex.refresh();
}

/** Clarence Pier — funfair that runs along the coast (not out to sea). */
function makeClarencePier(scene: Phaser.Scene): void {
  const w = 340;
  const h = 160;
  const tex = scene.textures.createCanvas("landmark_clarence_pier", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    // Arcade / ride sheds along the shore
    const sheds: [number, number, string][] = [
      [10, 70, "#c45c4a"],
      [70, 75, "#3a6db0"],
      [130, 68, "#e8a030"],
      [190, 72, "#6a3a8a"],
    ];
    for (const [x, y, fill] of sheds) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, 55, 55);
      ctx.strokeRect(x, y, 55, 55);
      ctx.fillStyle = "#e8d080";
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 27, y - 14);
      ctx.lineTo(x + 58, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Big wheel
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(280, 70, 48, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(280, 70);
      ctx.lineTo(280 + Math.cos(a) * 48, 70 + Math.sin(a) * 48);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(280 + Math.cos(a) * 40, 70 + Math.sin(a) * 40, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#e07060";
      ctx.fill();
      ctx.stroke();
    }
    // Legs
    ctx.beginPath();
    ctx.moveTo(280, 70);
    ctx.lineTo(250, 150);
    ctx.moveTo(280, 70);
    ctx.lineTo(310, 150);
    ctx.stroke();

    // Neon scribble sign
    ctx.fillStyle = "#f0e040";
    ctx.fillRect(40, 40, 90, 18);
    ctx.strokeRect(40, 40, 90, 18);
  }, "#1a1410", 3);

  tex.refresh();
}

/** Henry VIII’s Southsea Castle — squat stone fort on the shingle. */
function makeSouthseaCastle(scene: Phaser.Scene): void {
  const w = 220;
  const h = 140;
  const tex = scene.textures.createCanvas("landmark_southsea_castle", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "#8a8478";
    // Central keep
    ctx.beginPath();
    ctx.moveTo(70, 120);
    ctx.lineTo(70, 50);
    ctx.lineTo(90, 35);
    ctx.lineTo(130, 35);
    ctx.lineTo(150, 50);
    ctx.lineTo(150, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Bastions
    ctx.beginPath();
    ctx.moveTo(20, 120);
    ctx.lineTo(40, 70);
    ctx.lineTo(70, 80);
    ctx.lineTo(70, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(150, 120);
    ctx.lineTo(150, 80);
    ctx.lineTo(180, 70);
    ctx.lineTo(200, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gun ports
    ctx.fillStyle = "#2a2820";
    ctx.fillRect(95, 60, 10, 14);
    ctx.fillRect(115, 60, 10, 14);
    ctx.strokeRect(95, 60, 10, 14);
    ctx.strokeRect(115, 60, 10, 14);
    // Flag
    ctx.beginPath();
    ctx.moveTo(110, 35);
    ctx.lineTo(110, 12);
    ctx.lineTo(130, 18);
    ctx.lineTo(110, 22);
    ctx.stroke();
  }, "#1a1410", 3);

  tex.refresh();
}

/** The Pyramids leisure centre — glass pyramid roofs. */
function makePyramids(scene: Phaser.Scene): void {
  const w = 200;
  const h = 120;
  const tex = scene.textures.createCanvas("landmark_pyramids", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "#7a9aaa";
    // Base block
    ctx.fillRect(20, 70, 160, 40);
    ctx.strokeRect(20, 70, 160, 40);
    // Three pyramid peaks
    const peaks = [
      [40, 70, 70],
      [100, 70, 85],
      [160, 70, 70],
    ];
    for (const [cx, baseY, peak] of peaks) {
      ctx.fillStyle = "rgba(160,200,220,0.85)";
      ctx.beginPath();
      ctx.moveTo(cx - 28, baseY);
      ctx.lineTo(cx, baseY - peak + 20);
      ctx.lineTo(cx + 28, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // glass pane lines
      ctx.beginPath();
      ctx.moveTo(cx, baseY - peak + 20);
      ctx.lineTo(cx, baseY);
      ctx.stroke();
    }
  }, "#1a1410", 3);

  tex.refresh();
}

/** Portsmouth Naval Memorial obelisk on the Common. */
function makeNavalMemorial(scene: Phaser.Scene): void {
  const w = 80;
  const h = 160;
  const tex = scene.textures.createCanvas("landmark_naval_memorial", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "#c8c4b8";
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.lineTo(35, 40);
    ctx.lineTo(45, 40);
    ctx.lineTo(50, 150);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cap
    ctx.beginPath();
    ctx.moveTo(32, 40);
    ctx.lineTo(40, 18);
    ctx.lineTo(48, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Base plinth
    ctx.fillRect(18, 145, 44, 12);
    ctx.strokeRect(18, 145, 44, 12);
  }, "#1a1410", 3);

  tex.refresh();
}

/** Spinnaker Tower — distant Gunwharf Quay sail. */
function makeSpinnaker(scene: Phaser.Scene): void {
  const w = 70;
  const h = 180;
  const tex = scene.textures.createCanvas("landmark_spinnaker", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "#e8eef4";
    ctx.beginPath();
    ctx.moveTo(20, 170);
    ctx.quadraticCurveTo(8, 80, 22, 20);
    ctx.lineTo(28, 20);
    ctx.quadraticCurveTo(18, 90, 32, 170);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Viewing deck blob
    ctx.fillStyle = "#b0c0d0";
    ctx.beginPath();
    ctx.ellipse(26, 55, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#1a1410", 2.5);

  tex.refresh();
}

/** Palmerston’s Folly — one of the Solent sea forts. */
function makeSolentFort(scene: Phaser.Scene): void {
  const w = 90;
  const h = 50;
  const tex = scene.textures.createCanvas("solent_fort", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    ctx.fillStyle = "#6a6860";
    ctx.beginPath();
    ctx.ellipse(45, 28, 38, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5a5850";
    ctx.beginPath();
    ctx.ellipse(45, 22, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#1a1410", 2);

  tex.refresh();
}

function makeWeapons(scene: Phaser.Scene): void {
  // Bottle
  {
    const tex = scene.textures.createCanvas("weapon_bottle", 28, 48)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 28, 48);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#6ecf7a";
      ctx.beginPath();
      ctx.moveTo(10, 8);
      ctx.lineTo(18, 8);
      ctx.lineTo(20, 18);
      ctx.lineTo(22, 40);
      ctx.lineTo(6, 40);
      ctx.lineTo(8, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff8";
      ctx.fillRect(12, 12, 4, 8);
    }, "#1a1410", 2.5);
    tex.refresh();
  }
  // Bat
  {
    const tex = scene.textures.createCanvas("weapon_bat", 56, 20)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 56, 20);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#b8894a";
      ctx.beginPath();
      ctx.moveTo(4, 10);
      ctx.lineTo(40, 6);
      ctx.lineTo(52, 8);
      ctx.lineTo(52, 12);
      ctx.lineTo(40, 14);
      ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, "#1a1410", 2.5);
    tex.refresh();
  }
  // Brick
  {
    const tex = scene.textures.createCanvas("weapon_brick", 32, 20)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 32, 20);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#b04a3a";
      ctx.fillRect(4, 4, 24, 12);
      ctx.strokeRect(4, 4, 24, 12);
      ctx.beginPath();
      ctx.moveTo(16, 4);
      ctx.lineTo(16, 16);
      ctx.stroke();
    }, "#1a1410", 2.5);
    tex.refresh();
  }
}

function makeForeground(scene: Phaser.Scene): void {
  makeBin(scene, "prop_bin", "#4a4a4a");
  makeBin(scene, "prop_bin_green", "#3d5a3d");
  makeBinBroken(scene);
  makeBollard(scene);
  makeBollardBroken(scene);
  makeSeagull(scene);
}

function makeBin(scene: Phaser.Scene, key: string, fill: string): void {
  const tex = scene.textures.createCanvas(key, 48, 64)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 48, 64);
  scratchStroke(ctx, () => {
    ctx.fillStyle = fill;
    ctx.fillRect(8, 14, 32, 46);
    ctx.strokeRect(8, 14, 32, 46);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(4, 8, 40, 10);
    ctx.strokeRect(4, 8, 40, 10);
  });
  tex.refresh();
}

function makeBinBroken(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas("prop_bin_broken", 56, 48)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 56, 48);
  scratchStroke(ctx, () => {
    ctx.fillStyle = "#4a4a4a";
    // tipped / crumpled
    ctx.beginPath();
    ctx.moveTo(6, 40);
    ctx.lineTo(12, 18);
    ctx.lineTo(38, 14);
    ctx.lineTo(48, 36);
    ctx.lineTo(20, 44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // spill scribbles
    ctx.beginPath();
    ctx.moveTo(30, 36);
    ctx.lineTo(44, 42);
    ctx.moveTo(28, 40);
    ctx.lineTo(50, 38);
    ctx.stroke();
  });
  tex.refresh();
}

function makeBollard(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas("prop_bollard", 36, 64)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 36, 64);
  scratchStroke(ctx, () => {
    ctx.fillStyle = "#888";
    ctx.fillRect(10, 22, 16, 40);
    ctx.strokeRect(10, 22, 16, 40);
    ctx.beginPath();
    ctx.arc(18, 18, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  tex.refresh();
}

function makeBollardBroken(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas("prop_bollard_broken", 48, 40)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 48, 40);
  scratchStroke(ctx, () => {
    ctx.fillStyle = "#888";
    // snapped stump
    ctx.fillRect(16, 22, 14, 16);
    ctx.strokeRect(16, 22, 14, 16);
    // top lying on side
    ctx.beginPath();
    ctx.ellipse(34, 28, 12, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  tex.refresh();
}

function makeSeagull(scene: Phaser.Scene): void {
  for (const [key, wing] of [
    ["prop_seagull_0", -11],
    ["prop_seagull_1", 2],
    ["prop_seagull_2", 12],
  ] as const) {
    const tex = scene.textures.createCanvas(key, 56, 36)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 56, 36);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#f2f0ea";
      ctx.beginPath();
      ctx.ellipse(28, 20, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(36, 17, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(39, 17);
      ctx.lineTo(46, 18);
      ctx.lineTo(39, 19);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, 18);
      ctx.quadraticCurveTo(16, 18 + wing, 6, 22 - wing * 0.3);
      ctx.moveTo(28, 18);
      ctx.quadraticCurveTo(40, 18 + wing, 50, 22 - wing * 0.3);
      ctx.stroke();
    }, "#1a1410", 2);
    tex.refresh();
  }
}

function makeCar(scene: Phaser.Scene): void {
  const w = 160;
  const h = 78;

  const paint = (ctx: CanvasRenderingContext2D, stage: 0 | 1 | 2 | 3): void => {
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(w / 2, h - 4, 62, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      const body = stage >= 3 ? "#2a2a2a" : stage >= 2 ? "#4a3a3a" : stage >= 1 ? "#5a4540" : "#6a3a3a";
      ctx.fillStyle = body;
      // SF2-ish side profile saloon
      ctx.beginPath();
      ctx.moveTo(8, 52);
      ctx.lineTo(18, 34);
      ctx.lineTo(48, 28);
      ctx.lineTo(70, 16);
      ctx.lineTo(110, 16);
      ctx.lineTo(128, 30);
      ctx.lineTo(148, 36);
      ctx.lineTo(152, 58);
      ctx.lineTo(8, 58);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Windows
      ctx.fillStyle = stage >= 2 ? "#3a4048" : "#9ec4d8";
      ctx.beginPath();
      ctx.moveTo(72, 20);
      ctx.lineTo(105, 20);
      ctx.lineTo(118, 32);
      ctx.lineTo(78, 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(52, 32);
      ctx.lineTo(74, 20);
      ctx.lineTo(74, 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (stage >= 1) {
        // dents
        ctx.beginPath();
        ctx.moveTo(30, 40);
        ctx.quadraticCurveTo(40, 48, 50, 38);
        ctx.stroke();
      }
      if (stage >= 2) {
        ctx.beginPath();
        ctx.moveTo(80, 22);
        ctx.lineTo(100, 34);
        ctx.moveTo(100, 22);
        ctx.lineTo(80, 34);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(120, 40);
        ctx.lineTo(140, 50);
        ctx.stroke();
      }
      if (stage >= 3) {
        ctx.fillStyle = "#1a1410";
        ctx.fillRect(60, 18, 40, 8);
        ctx.beginPath();
        ctx.moveTo(20, 50);
        ctx.lineTo(40, 58);
        ctx.stroke();
      }

      // Wheels
      ctx.fillStyle = "#1a1410";
      ctx.beginPath();
      ctx.arc(38, 58, 11, 0, Math.PI * 2);
      ctx.arc(118, stage >= 3 ? 56 : 58, stage >= 3 ? 10 : 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(38, 58, 4, 0, Math.PI * 2);
      ctx.arc(118, stage >= 3 ? 56 : 58, 4, 0, Math.PI * 2);
      ctx.fill();

      // Bumper / lights
      ctx.fillStyle = stage >= 2 ? "#c8a050" : "#e8d080";
      ctx.fillRect(8, 44, 8, 8);
      ctx.strokeRect(8, 44, 8, 8);
      ctx.fillStyle = "#c04040";
      ctx.fillRect(144, 44, 6, 8);
      ctx.strokeRect(144, 44, 6, 8);
    }, "#1a1410", 2.5);
  };

  for (const [key, stage] of [
    ["car", 0],
    ["car_dent1", 1],
    ["car_dent2", 2],
    ["car_wrecked", 3],
  ] as const) {
    const tex = scene.textures.createCanvas(key, w, h)!;
    paint(tex.getContext(), stage);
    tex.refresh();
  }
}

export type Pose = SorPose;

function makeAllLookSheets(scene: Phaser.Scene): void {
  for (const look of POMPEY_LOOKS) {
    makeLookSheet(scene, look);
  }
  // Legacy aliases so anything still asking for civ_/player_ etc. doesn't blank
  aliasLook(scene, "player", "look_p00");
  aliasLook(scene, "enemy", "look_e00");
  aliasLook(scene, "civ", "look_c00");
  aliasLook(scene, "police", "look_o00");
}

function aliasLook(scene: Phaser.Scene, oldPrefix: string, lookId: string): void {
  const poses: Pose[] = [
    "idle",
    "walk0",
    "walk1",
    "walk2",
    "walk3",
    "run0",
    "run1",
    "run2",
    "run3",
    "run",
    "jump",
    "jump_kick",
    "punch",
    "jab",
    "upper",
    "backhand",
    "headbutt",
    "kick",
    "stomp_up",
    "stomp",
    "weapon_swing",
    "hurt",
    "hold_gut",
    "limp_arm",
    "limp_leg",
    "down",
    "angry",
    "cuffed",
    "bloodied",
    "film",
    "block",
  ];
  for (const pose of poses) {
    const src = `${lookId}_${pose}`;
    const dst = `${oldPrefix}_${pose}`;
    if (scene.textures.exists(src) && !scene.textures.exists(dst)) {
      const img = scene.textures.get(src).getSourceImage() as HTMLCanvasElement;
      scene.textures.addCanvas(dst, img);
    }
  }
}

function makeLookSheet(scene: Phaser.Scene, look: PersonLook): void {
  const poses: Pose[] = [
    "idle",
    "walk0",
    "walk1",
    "walk2",
    "walk3",
    "run0",
    "run1",
    "run2",
    "run3",
    "run",
    "jump",
    "jump_kick",
    "punch",
    "jab",
    "upper",
    "backhand",
    "headbutt",
    "kick",
    "stomp_up",
    "stomp",
    "weapon_swing",
    "hurt",
    "hold_gut",
    "limp_arm",
    "limp_leg",
    "down",
    "angry",
    "cuffed",
    "bloodied",
    "film",
    "block",
  ];

  for (const pose of poses) {
    const key = `${look.id}_${pose}`;
    const wide = pose === "down" || pose === "cuffed";
    const fw = wide ? 100 : 84;
    const fh = wide ? 56 : 92;
    const tex = scene.textures.createCanvas(key, fw, fh)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, fw, fh);
    if (wide) {
      drawSorDown(ctx, fw, fh, look.skin, look.shirt, pose === "cuffed", false, {
        pants: look.pants,
        hair: look.hair,
        build: look.build,
      });
    } else {
      drawSorFighter(ctx, fw / 2, fh - 4, look.skin, look.shirt, pose, {
        hair: look.hair,
        pants: look.pants,
        build: look.build,
        bloodied: pose === "bloodied",
      });
    }
    tex.refresh();
  }
}

// landmark doodles still use wobble
void wobble;
