import Phaser from "phaser";
import { GAME_HEIGHT } from "../constants";
import {
  drawSorFighter,
  drawSorDown,
  drawSorCrawl,
  drawDistantPerson,
  drawFisherman,
  drawBeachBbq,
  drawCoffeeVan,
  drawCoffeeCupCafe,
  drawKidsPark,
  drawContainerShip,
  drawMotorBoat,
  drawJetSki,
  drawKayak,
  drawDog,
  drawBike,
  drawScooter,
  drawSkateboard,
  drawBrokenSkateHalf,
  drawWheelchair,
  type SorPose,
} from "./sorFigure";
import { POMPEY_LOOKS, type PersonLook } from "./pompeyLooks";
import { drawTitleLogo, TITLE_LOGO_H, TITLE_LOGO_W } from "./titleLogo";

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
  const VERSION = "doodle_v114";
  if (scene.textures.exists(VERSION)) return;
  if (
    scene.textures.exists("sky") ||
    scene.textures.exists("doodle_v113") ||
    scene.textures.exists("doodle_v112") ||
    scene.textures.exists("doodle_v111") ||
    scene.textures.exists("doodle_v110") ||
    scene.textures.exists("doodle_v109") ||
    scene.textures.exists("doodle_v108") ||
    scene.textures.exists("doodle_v107") ||
    scene.textures.exists("doodle_v103") ||
    scene.textures.exists("doodle_v102") ||
    scene.textures.exists("doodle_v101") ||
    scene.textures.exists("doodle_v100") ||
    scene.textures.exists("doodle_v99") ||
    scene.textures.exists("doodle_v98") ||
    scene.textures.exists("doodle_v97") ||
    scene.textures.exists("doodle_v96") ||
    scene.textures.exists("doodle_v95") ||
    scene.textures.exists("doodle_v94") ||
    scene.textures.exists("doodle_v93") ||
    scene.textures.exists("doodle_v92") ||
    scene.textures.exists("doodle_v91") ||
    scene.textures.exists("doodle_v90") ||
    scene.textures.exists("doodle_v89") ||
    scene.textures.exists("doodle_v88") ||
    scene.textures.exists("doodle_v87") ||
    scene.textures.exists("doodle_v86") ||
    scene.textures.exists("doodle_v85") ||
    scene.textures.exists("doodle_v84") ||
    scene.textures.exists("doodle_v83") ||
    scene.textures.exists("doodle_v81") ||
    scene.textures.exists("doodle_v80") ||
    scene.textures.exists("doodle_v78") ||
    scene.textures.exists("doodle_v77") ||
    scene.textures.exists("doodle_v76") ||
    scene.textures.exists("doodle_v75") ||
    scene.textures.exists("doodle_v74") ||
    scene.textures.exists("doodle_v73") ||
    scene.textures.exists("doodle_v72") ||
    scene.textures.exists("doodle_v71") ||
    scene.textures.exists("doodle_v70") ||
    scene.textures.exists("doodle_v69") ||
    scene.textures.exists("doodle_v68") ||
    scene.textures.exists("doodle_v67") ||
    scene.textures.exists("doodle_v66") ||
    scene.textures.exists("doodle_v44") ||
    scene.textures.exists("doodle_v43") ||
    scene.textures.exists("doodle_v42") ||
    scene.textures.exists("doodle_v41") ||
    scene.textures.exists("doodle_v40") ||
    scene.textures.exists("doodle_v39") ||
    scene.textures.exists("doodle_v38") ||
    scene.textures.exists("doodle_v37") ||
    scene.textures.exists("doodle_v36") ||
    scene.textures.exists("doodle_v35") ||
    scene.textures.exists("doodle_v34") ||
    scene.textures.exists("doodle_v33") ||
    scene.textures.exists("doodle_v32") ||
    scene.textures.exists("doodle_v31") ||
    scene.textures.exists("doodle_v30") ||
    scene.textures.exists("doodle_v29") ||
    scene.textures.exists("doodle_v28") ||
    scene.textures.exists("doodle_v27") ||
    scene.textures.exists("doodle_v26") ||
    scene.textures.exists("doodle_v25") ||
    scene.textures.exists("doodle_v24") ||
    scene.textures.exists("doodle_v23") ||
    scene.textures.exists("doodle_v22") ||
    scene.textures.exists("doodle_v21") ||
    scene.textures.exists("doodle_v20") ||
    scene.textures.exists("doodle_v19") ||
    scene.textures.exists("doodle_v18") ||
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
        key.startsWith("stall_") ||
        key.startsWith("distant_") ||
        [
          "sky",
          "clouds",
          "clouds_far",
          "clouds_mid",
          "clouds_near",
          "sea",
          "sea_0",
          "sea_1",
          "sea_2",
          "beach",
          "road",
          "common",
          "grass_verge",
          "pier",
          "isle_wight",
          "car",
          "car_dent1",
          "car_dent2",
          "car_wrecked",
          "traffic_hatch",
          "traffic_van",
          "traffic_bike",
          "traffic_bus",
          "traffic_scooter_0",
          "traffic_scooter_1",
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
          "solent_fort_spitbank",
          "solent_fort_horsesand",
          "solent_fort_nomans",
          "container_ship",
          "sea_boat",
          "sea_jetski",
          "sea_kayak_0",
          "sea_kayak_1",
          "dog",
          "coffee_van",
          "coffee_cup_cafe",
          "kids_park",
          "beach_bbq",
          "beach_bbq_1",
          "beach_bbq_0",
          "beach_bbq_2",
          "beach_bbq_3",
          "distant_fisherman_0",
          "distant_fisherman_1",
          "title_logo",
          "sky_spitfire",
          "hovercraft_0",
          "hovercraft_1",
          "stall_weapons",
          "weapon_chain",
          "weapon_cue",
          "weapon_knuckle",
          "sky_drone_0",
          "sky_drone_1",
          "tower_kids_0",
          "tower_kids_1",
          "tower_kids_2",
          "tower_kids_3",
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
  makeGrassVerge(scene);
  makeBeach(scene);
  makeRoad(scene);
  makeSouthParadePier(scene);
  makePierEntrance(scene);
  makeClarencePier(scene);
  makeSeaDefences(scene);
  makeRoundTower(scene);
  makeTowerKidsJump(scene);
  makeClarenceFunfair(scene);
  makeHovercraftPort(scene);
  makeSouthseaCastle(scene);
  makePyramids(scene);
  makeNavalMemorial(scene);
  makeSpinnaker(scene);
  makeSolentFort(scene);
  makeForeground(scene);
  makeCar(scene);
  makePassingTraffic(scene);
  makeFoodStalls(scene);
  makeWeapons(scene);
  makeSceneryExtras(scene);
  makeTitleLogo(scene);
  makeAllLookSheets(scene);
  scene.textures.createCanvas(VERSION, 2, 2)?.refresh();
}

/** Streets of Rage–style chrome italic wordmark for the title screen. */
function makeTitleLogo(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas("title_logo", TITLE_LOGO_W, TITLE_LOGO_H)!;
  drawTitleLogo(tex.getContext(), TITLE_LOGO_W, TITLE_LOGO_H);
  tex.refresh();
}

function makeSceneryExtras(scene: Phaser.Scene): void {
  {
    const tex = scene.textures.createCanvas("container_ship", 110, 48)!;
    drawContainerShip(tex.getContext(), 110, 48);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_boat", 96, 48)!;
    drawMotorBoat(tex.getContext(), 96, 48);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_jetski", 64, 40)!;
    drawJetSki(tex.getContext(), 64, 40);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_kayak_0", 64, 40)!;
    drawKayak(tex.getContext(), 64, 40, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("sea_kayak_1", 64, 40)!;
    drawKayak(tex.getContext(), 64, 40, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_walker", 24, 36)!;
    drawDistantPerson(tex.getContext(), 24, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_fisherman", 56, 52)!;
    drawFisherman(tex.getContext(), 56, 52, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_fisherman_0", 56, 52)!;
    drawFisherman(tex.getContext(), 56, 52, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("distant_fisherman_1", 56, 52)!;
    drawFisherman(tex.getContext(), 56, 52, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("beach_bbq_0", 120, 96)!;
    drawBeachBbq(tex.getContext(), 120, 96, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("beach_bbq_1", 120, 96)!;
    drawBeachBbq(tex.getContext(), 120, 96, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("beach_bbq_2", 120, 96)!;
    drawBeachBbq(tex.getContext(), 120, 96, 2);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("beach_bbq_3", 120, 96)!;
    drawBeachBbq(tex.getContext(), 120, 96, 3);
    tex.refresh();
  }
  // Alias for landmarks that still seed from "beach_bbq"
  {
    const tex = scene.textures.createCanvas("beach_bbq", 120, 96)!;
    drawBeachBbq(tex.getContext(), 120, 96, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("coffee_van", 200, 130)!;
    drawCoffeeVan(tex.getContext(), 200, 130);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("coffee_cup_cafe", 240, 170)!;
    drawCoffeeCupCafe(tex.getContext(), 240, 170);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("kids_park", 220, 150)!;
    drawKidsPark(tex.getContext(), 220, 150);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("dog", 48, 36)!;
    drawDog(tex.getContext(), 48, 36);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_bike", 64, 48)!;
    drawBike(tex.getContext(), 64, 48, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_bike_1", 64, 48)!;
    drawBike(tex.getContext(), 64, 48, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_scooter", 64, 64)!;
    drawScooter(tex.getContext(), 64, 64, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_scooter_1", 64, 64)!;
    drawScooter(tex.getContext(), 64, 64, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_wheelchair", 56, 48)!;
    drawWheelchair(tex.getContext(), 56, 48);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_skate", 64, 28)!;
    drawSkateboard(tex.getContext(), 64, 28, 0);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_skate_1", 64, 28)!;
    drawSkateboard(tex.getContext(), 64, 28, 1);
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_skate_tail", 36, 28)!;
    drawBrokenSkateHalf(tex.getContext(), 36, 28, "tail");
    tex.refresh();
  }
  {
    const tex = scene.textures.createCanvas("mount_skate_nose", 36, 28)!;
    drawBrokenSkateHalf(tex.getContext(), 36, 28, "nose");
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
  const puff = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
    alpha: number,
  ) => {
    const lobes: [number, number, number][] = [
      [0, 0, 22],
      [-18, 4, 16],
      [16, 5, 15],
      [-8, -10, 14],
      [10, -8, 13],
      [0, 8, 17],
    ];
    ctx.fillStyle = `rgba(245,248,252,${alpha})`;
    for (const [dx, dy, r] of lobes) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * scale, cy + dy * scale, r * scale, r * scale * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(180,195,210,${alpha * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10 * scale, 28 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const bake = (
    key: string,
    w: number,
    h: number,
    banks: [number, number, number, number][],
  ) => {
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    for (const [x, y, scale, alpha] of banks) puff(ctx, x, y, scale, alpha);
    tex.refresh();
  };

  // Far haze — small / sparse / high
  bake("clouds_far", 900, 160, [
    [70, 40, 0.55, 0.32],
    [260, 28, 0.42, 0.26],
    [480, 48, 0.5, 0.28],
    [700, 34, 0.38, 0.24],
    [840, 52, 0.45, 0.22],
  ]);
  // Mid scud
  bake("clouds_mid", 768, 180, [
    [90, 70, 1.15, 0.55],
    [280, 48, 0.85, 0.4],
    [480, 82, 1.05, 0.48],
    [670, 55, 0.7, 0.35],
  ]);
  // Near — chunkier, lower in the band
  bake("clouds_near", 720, 170, [
    [110, 88, 1.35, 0.58],
    [340, 72, 1.0, 0.46],
    [560, 95, 1.2, 0.52],
  ]);
  // Legacy alias for anything still asking for "clouds"
  bake("clouds", 768, 180, [
    [90, 70, 1.15, 0.55],
    [280, 48, 0.85, 0.4],
    [480, 82, 1.05, 0.48],
    [670, 55, 0.7, 0.35],
  ]);
}

function makeSea(scene: Phaser.Scene): void {
  // Solent chop — grey-green, soft horizon / foreshore; a few swell phases for subtle motion
  const w = 512;
  const h = 120;

  const bake = (key: string, phase: number, foamBoost: number) => {
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);

    const depth = ctx.createLinearGradient(0, 0, 0, h);
    depth.addColorStop(0, "rgba(106,154,170,0)");
    depth.addColorStop(0.07, "rgba(106,154,170,0.5)");
    depth.addColorStop(0.16, "rgba(74,122,140,0.92)");
    depth.addColorStop(0.42, "rgba(58,101,120,1)");
    depth.addColorStop(0.72, "rgba(46,83,100,1)");
    depth.addColorStop(0.9, "rgba(36,63,78,0.85)");
    depth.addColorStop(1, "rgba(36,63,78,0)");
    ctx.fillStyle = depth;
    ctx.fillRect(0, 0, w, h);

    const haze = ctx.createLinearGradient(0, 0, 0, 28);
    haze.addColorStop(0, "rgba(190,210,220,0.4)");
    haze.addColorStop(1, "rgba(190,210,220,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, 28);

    for (let i = 0; i < 5; i++) {
      const y0 = 30 + i * 15 + Math.sin(phase + i * 0.7) * 1.6;
      const band = ctx.createLinearGradient(0, y0 - 6, 0, y0 + 10);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.45, `rgba(210,230,235,${0.06 + i * 0.015})`);
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 16) {
        ctx.lineTo(
          x,
          y0 +
            Math.sin(x * 0.028 + i * 1.3 + phase) * (3.5 + i * 0.4) +
            Math.sin(x * 0.07 + phase * 1.4) * 1.2,
        );
      }
      ctx.lineTo(w, y0 + 14);
      ctx.lineTo(0, y0 + 14);
      ctx.closePath();
      ctx.fill();
    }

    scratchStroke(ctx, () => {
      for (let i = 0; i < 10; i++) {
        const y = 22 + i * 8.5 + Math.sin(phase * 0.8 + i) * 1.2;
        ctx.globalAlpha = 0.28 + (i % 3) * 0.07;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 22) {
          ctx.lineTo(
            x,
            y +
              Math.sin(x * 0.045 + i * 0.9 + phase) * 3.2 +
              Math.sin(x * 0.11 + i + phase * 0.6) * 1.4,
          );
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }, "#1e3844", 1.6);

    const foamY = h - 28 + Math.sin(phase) * 2;
    const foamFade = ctx.createLinearGradient(0, foamY, 0, h);
    foamFade.addColorStop(0, "rgba(212,228,236,0)");
    foamFade.addColorStop(0.35, `rgba(212,228,236,${0.28 + foamBoost * 0.12})`);
    foamFade.addColorStop(0.7, `rgba(232,242,248,${0.38 + foamBoost * 0.14})`);
    foamFade.addColorStop(1, "rgba(232,242,248,0)");
    ctx.fillStyle = foamFade;
    ctx.fillRect(0, foamY, w, h - foamY);

    scratchStroke(ctx, () => {
      ctx.globalAlpha = 0.55 + foamBoost * 0.25;
      ctx.beginPath();
      ctx.moveTo(0, h - 16 + Math.sin(phase) * 2);
      for (let x = 0; x <= w; x += 14) {
        ctx.lineTo(
          x,
          h - 16 +
            Math.sin(x * 0.12 + phase) * 2.5 +
            Math.sin(x * 0.05 + phase * 1.2) * 1.5,
        );
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, h - 8 + Math.sin(phase + 1) * 1.5);
      for (let x = 0; x <= w; x += 18) {
        ctx.lineTo(x, h - 8 + Math.sin(x * 0.09 + 1 + phase) * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }, "#d4e4ec", 2.2);

    ctx.fillStyle = `rgba(230,242,248,${0.42 + foamBoost * 0.18})`;
    for (let i = 0; i < 18; i++) {
      const x = ((i * 97 + Math.floor(phase * 40)) % (w - 40)) + 12;
      const y = 34 + ((i * 53) % (h - 58)) + Math.sin(phase + i) * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + (i % 3), 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  };

  bake("sea_0", 0, 0.15);
  bake("sea_1", 1.15, 0.55);
  bake("sea_2", 2.3, 1);
  // Legacy alias
  bake("sea", 0, 0.15);
}

function makeCommon(scene: Phaser.Scene): void {
  // Upper shingle band (was the green Common strip) — continuous pebble field
  const w = 512;
  const h = 90;
  const tex = scene.textures.createCanvas("common", w, h)!;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8a8478");
  g.addColorStop(0.45, "#9a9288");
  g.addColorStop(1, "#7a7468");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  scratchStroke(ctx, () => {
    const tones = ["#a09888", "#8a8070", "#9a9080", "#7a7268", "#b0a898", "#6a6458"];
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.fillStyle = tones[i % tones.length]!;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        1.5 + Math.random() * 4,
        1 + Math.random() * 2.4,
        Math.random() * 0.8,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
  }, "#5a5448", 1.1);
  tex.refresh();
}

function makeGrassVerge(scene: Phaser.Scene): void {
  // Flat grass strip that sits hard against the promenade lip
  const w = 200;
  const h = 42;
  const tex = scene.textures.createCanvas("grass_verge", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  scratchStroke(ctx, () => {
    // Continuous turf bank — flat bottom (promenade), ragged top (into shingle)
    ctx.fillStyle = "#5a7a3a";
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    ctx.lineTo(0, h * 0.55);
    ctx.quadraticCurveTo(30, h * 0.22, 55, h * 0.38);
    ctx.quadraticCurveTo(90, h * 0.12, 120, h * 0.34);
    ctx.quadraticCurveTo(155, h * 0.18, 180, h * 0.4);
    ctx.quadraticCurveTo(195, h * 0.5, w, h * 0.58);
    ctx.lineTo(w, h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Blade tufts
    ctx.strokeStyle = "#7a9a4a";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 36; i++) {
      const x = 6 + i * 5.3;
      const base = h - 3 - Math.sin(i * 1.4) * 3;
      const tall = 7 + (i % 4) * 2;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + 1, base - tall * 0.55, x + (i % 2 ? 2 : -1.5), base - tall);
      ctx.stroke();
    }
    // Hard edge on the promenade side
    ctx.strokeStyle = "#3a5028";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    ctx.lineTo(w, h - 1);
    ctx.stroke();
  }, "#3a5028", 1.4);
  tex.refresh();
}

function makeBeach(scene: Phaser.Scene): void {
  // Southsea shingle — grey-brown pebbles only (no grass fill)
  // Zig-zag period must divide width so tileSprite edges join cleanly
  const slab = 48; // one paving stone
  const run = slab * 2; // horizontal short run
  const jog = slab * 2; // north/south step
  const period = run * 2; // full down + up cycle
  const w = period * 3; // 576
  const h = 280;
  const tex = scene.textures.createCanvas("beach", w, h)!;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8a8478");
  g.addColorStop(0.2, "#9a9288");
  g.addColorStop(0.55, "#8a8278");
  g.addColorStop(1, "#6e6860");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const pebble = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  scratchStroke(ctx, () => {
    const tones = ["#a09888", "#8a8070", "#9a9080", "#7a7268", "#b0a898", "#6a6458"];
    for (let i = 0; i < 250; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      pebble(
        x,
        y,
        1.5 + Math.random() * 4.5,
        1 + Math.random() * 2.8,
        tones[i % tones.length]!,
      );
    }
  }, "#5a5448", 1.1);

  // Wetter foreshore near the sea (top)
  scratchStroke(ctx, () => {
    ctx.fillStyle = "rgba(70,85,95,0.22)";
    ctx.fillRect(0, 0, w, 36);
  }, "#5a5448", 1);

  // The old zig-zag promenade — one row of square slabs, tight Grecian fret
  const promTop = Math.round(h * 0.2);

  // Darker tarmac under the fret
  ctx.fillStyle = "#7a7268";
  ctx.fillRect(0, promTop - 8, w, jog + slab + 24);

  // Pale path — exact runs so left edge matches right edge when tiled
  ctx.fillStyle = "#c8beb0";
  let y = promTop;
  let down = true;
  for (let x = 0; x < w; x += run) {
    ctx.fillRect(x, y, run, slab);
    const nextY = down ? y + jog : y - jog;
    const jx = x + run - slab;
    ctx.fillRect(jx, Math.min(y, nextY), slab, Math.abs(nextY - y) + slab);
    y = nextY;
    down = !down;
  }

  // Joints between the square stones
  ctx.strokeStyle = "rgba(90,80,70,0.55)";
  ctx.lineWidth = 2;
  y = promTop;
  down = true;
  for (let x = 0; x < w; x += run) {
    for (let sx = x; sx < x + run; sx += slab) {
      ctx.strokeRect(sx + 0.5, y + 0.5, slab, slab);
    }
    const nextY = down ? y + jog : y - jog;
    const jx = x + run - slab;
    const jTop = Math.min(y, nextY);
    for (let sy = jTop; sy < jTop + Math.abs(nextY - y) + slab; sy += slab) {
      ctx.strokeRect(jx + 0.5, sy + 0.5, slab, slab);
    }
    y = nextY;
    down = !down;
  }

  // Soft edge so the fret sits on the shingle — continuous polyline, one period loop
  ctx.strokeStyle = "rgba(40,35,30,0.35)";
  ctx.lineWidth = 2.5;
  y = promTop;
  down = true;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x < w; x += run) {
    const nextY = down ? y + jog : y - jog;
    const jx = x + run - slab;
    ctx.lineTo(jx, y);
    ctx.lineTo(jx, nextY);
    ctx.lineTo(x + run, nextY);
    y = nextY;
    down = !down;
  }
  // Close onto the next tile's start (same as x=0)
  ctx.stroke();

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
  // Long distant downs — soft tip fades, ridge stroke only (no bottom haze bar)
  const w = 980;
  const h = 64;
  const tex = scene.textures.createCanvas("isle_wight", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  const shore = h - 1;

  const ridge = (c: CanvasRenderingContext2D) => {
    c.moveTo(w * 0.04, shore);
    c.quadraticCurveTo(w * 0.07, h * 0.7, w * 0.11, h * 0.56);
    c.quadraticCurveTo(w * 0.18, h * 0.36, w * 0.26, h * 0.48);
    c.quadraticCurveTo(w * 0.36, h * 0.26, w * 0.44, h * 0.42);
    c.quadraticCurveTo(w * 0.52, h * 0.2, w * 0.58, h * 0.38);
    c.quadraticCurveTo(w * 0.7, h * 0.28, w * 0.8, h * 0.46);
    c.quadraticCurveTo(w * 0.9, h * 0.34, w * 0.95, h * 0.52);
    c.quadraticCurveTo(w * 0.975, h * 0.66, w * 0.99, shore);
  };

  ctx.fillStyle = "#8aa090";
  ctx.beginPath();
  ridge(ctx);
  ctx.closePath();
  ctx.fill();

  // Soft waterline gel so the island isn't a hard stamp on the sea
  const shoreFade = ctx.createLinearGradient(0, shore - 14, 0, shore + 1);
  shoreFade.addColorStop(0, "rgba(106,154,170,0)");
  shoreFade.addColorStop(0.55, "rgba(90,140,160,0.28)");
  shoreFade.addColorStop(1, "rgba(70,120,140,0.15)");
  ctx.fillStyle = shoreFade;
  ctx.fillRect(w * 0.03, shore - 14, w * 0.94, 15);

  // Ridge line only — never outline the waterline (avoids clipped ends)
  ctx.strokeStyle = "#6a8070";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ridge(ctx);
  ctx.stroke();

  // Small town (Ryde-ish) — a few roofs + one church spire
  const tx = w * 0.52;
  const ty = h * 0.4;
  ctx.fillStyle = "#7a8a80";
  ctx.fillRect(tx - 18, ty + 4, 8, 7);
  ctx.fillRect(tx - 8, ty + 2, 10, 9);
  ctx.fillRect(tx + 4, ty + 5, 7, 6);
  ctx.fillRect(tx + 14, ty + 3, 9, 8);
  ctx.fillStyle = "#6a7068";
  ctx.beginPath();
  ctx.moveTo(tx - 19, ty + 4);
  ctx.lineTo(tx - 14, ty - 1);
  ctx.lineTo(tx - 9, ty + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx - 9, ty + 2);
  ctx.lineTo(tx - 3, ty - 3);
  ctx.lineTo(tx + 3, ty + 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx + 13, ty + 3);
  ctx.lineTo(tx + 19, ty - 2);
  ctx.lineTo(tx + 24, ty + 3);
  ctx.fill();
  ctx.fillStyle = "#6e7a72";
  ctx.fillRect(tx + 28, ty - 2, 7, 14);
  ctx.beginPath();
  ctx.moveTo(tx + 27, ty - 2);
  ctx.lineTo(tx + 31.5, ty - 16);
  ctx.lineTo(tx + 36, ty - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5a655c";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tx + 31.5, ty - 16);
  ctx.lineTo(tx + 31.5, ty - 20);
  ctx.stroke();

  // Pale Needles hint
  ctx.strokeStyle = "rgba(208,220,200,0.45)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(w * 0.9, h * 0.48);
  ctx.lineTo(w * 0.94, h * 0.56);
  ctx.lineTo(w * 0.97, h * 0.52);
  ctx.stroke();

  // Fade tips into distance (no hard cut, no haze bar)
  ctx.globalCompositeOperation = "destination-out";
  const fadeL = ctx.createLinearGradient(0, 0, w * 0.1, 0);
  fadeL.addColorStop(0, "rgba(0,0,0,1)");
  fadeL.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fadeL;
  ctx.fillRect(0, 0, w * 0.1, h);
  const fadeR = ctx.createLinearGradient(w * 0.9, 0, w, 0);
  fadeR.addColorStop(0, "rgba(0,0,0,0)");
  fadeR.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = fadeR;
  ctx.fillRect(w * 0.9, 0, w * 0.1, h);
  ctx.globalCompositeOperation = "source-over";

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

/**
 * South Parade Pier entrance — wide seaside facade you walk right past,
 * mouth open to the amusements: glowing arcade cabinets in the gloom.
 */
function makePierEntrance(scene: Phaser.Scene): void {
  const w = 720;
  const h = 250;
  const tex = scene.textures.createCanvas("landmark_pier_entrance", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const baseY = h - 4;

  scratchStroke(ctx, () => {
    // ——— Facade body (cream seaside stucco) ———
    ctx.fillStyle = "#efe2c8";
    ctx.beginPath();
    ctx.moveTo(6, baseY);
    ctx.lineTo(8, 70);
    ctx.lineTo(w - 10, 64);
    ctx.lineTo(w - 6, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();

    // Pitched roofline with red trim + little flags
    ctx.fillStyle = "#c45c4a";
    ctx.beginPath();
    ctx.moveTo(0, 74);
    ctx.lineTo(w * 0.5, 34);
    ctx.lineTo(w, 66);
    ctx.lineTo(w, 84);
    ctx.lineTo(w * 0.5, 52);
    ctx.lineTo(0, 92);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const fx of [w * 0.2, w * 0.5, w * 0.8]) {
      const fy = 34 + Math.abs(fx - w * 0.5) * 0.08;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 22);
      ctx.stroke();
      ctx.fillStyle = fx === w * 0.5 ? "#e8a030" : "#3a6db0";
      ctx.beginPath();
      ctx.moveTo(fx, fy - 22);
      ctx.lineTo(fx + 16, fy - 17);
      ctx.lineTo(fx, fy - 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ——— AMUSEMENTS sign band ———
    ctx.fillStyle = "#f0e040";
    ctx.fillRect(w * 0.16, 88, w * 0.68, 34);
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.16, 88, w * 0.68, 34);
    // Scribble lettering
    ctx.fillStyle = "#1a1410";
    ctx.font = "bold 24px 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.fillText("A M U S E M E N T S", w * 0.5, 112);
    // Bulbs round the sign
    for (let i = 0; i < 16; i++) {
      const bx = w * 0.16 + (i / 15) * w * 0.68;
      ctx.fillStyle = i % 2 ? "#fff8e8" : "#e8a030";
      ctx.beginPath();
      ctx.arc(bx, 84, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // ——— Wide open entrance ———
    const doorL = w * 0.14;
    const doorR = w * 0.86;
    const doorTop = 132;
    ctx.fillStyle = "#241c30";
    ctx.beginPath();
    ctx.moveTo(doorL, baseY);
    ctx.lineTo(doorL, doorTop + 16);
    ctx.quadraticCurveTo(w * 0.5, doorTop - 18, doorR, doorTop + 16);
    ctx.lineTo(doorR, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();

    // Glow spilling out the doorway onto the boards
    const glow = ctx.createLinearGradient(0, doorTop, 0, baseY);
    glow.addColorStop(0, "rgba(120,200,255,0.16)");
    glow.addColorStop(1, "rgba(255,120,200,0.10)");
    ctx.fillStyle = glow;
    ctx.fillRect(doorL + 4, doorTop + 4, doorR - doorL - 8, baseY - doorTop - 8);

    // ——— Arcade cabinets inside (dark shapes, bright screens) ———
    const cabs: [number, number, string][] = [
      [doorL + 34, 0.86, "#48d0e8"],
      [doorL + 96, 0.92, "#e858a8"],
      [doorL + 158, 0.84, "#68e858"],
      [w * 0.5 - 26, 0.9, "#f0c040"],
      [doorR - 196, 0.86, "#8878f0"],
      [doorR - 134, 0.93, "#48d0e8"],
      [doorR - 72, 0.87, "#e85848"],
    ];
    for (const [cx, s, screen] of cabs) {
      const ch = 74 * s;
      const cw = 34 * s;
      const cy = baseY - 6;
      // Cabinet silhouette with sloped marquee
      ctx.fillStyle = "#181424";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - ch * 0.82);
      ctx.lineTo(cx + cw * 0.2, cy - ch);
      ctx.lineTo(cx + cw, cy - ch * 0.94);
      ctx.lineTo(cx + cw, cy);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#0c0a14";
      ctx.stroke();
      // Glowing screen
      ctx.fillStyle = screen;
      ctx.fillRect(cx + cw * 0.16, cy - ch * 0.82, cw * 0.68, ch * 0.3);
      // Screen glow halo
      const gr = parseInt(screen.slice(1, 3), 16);
      const gg = parseInt(screen.slice(3, 5), 16);
      const gb = parseInt(screen.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
      ctx.fillRect(cx + cw * 0.02, cy - ch * 0.9, cw * 0.96, ch * 0.46);
      // Marquee strip
      ctx.fillStyle = "#e8a030";
      ctx.fillRect(cx + cw * 0.2, cy - ch, cw * 0.8, ch * 0.08);
    }

    // Claw machine — glass box with prizes
    const clawX = w * 0.5 + 44;
    const clawY = baseY - 6;
    ctx.fillStyle = "#20303a";
    ctx.fillRect(clawX, clawY - 78, 44, 78);
    ctx.strokeStyle = "#0c0a14";
    ctx.strokeRect(clawX, clawY - 78, 44, 78);
    ctx.fillStyle = "rgba(150,220,255,0.35)";
    ctx.fillRect(clawX + 4, clawY - 72, 36, 44);
    for (const [px, pc] of [
      [clawX + 10, "#e858a8"],
      [clawX + 22, "#68e858"],
      [clawX + 32, "#f0c040"],
    ] as [number, string][]) {
      ctx.fillStyle = pc;
      ctx.beginPath();
      ctx.arc(px, clawY - 34, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#c8d8e0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(clawX + 22, clawY - 70);
    ctx.lineTo(clawX + 22, clawY - 52);
    ctx.stroke();

    // ——— Entrance columns with red candy stripes ———
    ctx.strokeStyle = "#1a1410";
    for (const colX of [doorL - 8, w * 0.5 - 9, doorR - 10]) {
      ctx.fillStyle = "#efe2c8";
      ctx.fillRect(colX, doorTop - 6, 18, baseY - doorTop + 6);
      ctx.lineWidth = 3;
      ctx.strokeRect(colX, doorTop - 6, 18, baseY - doorTop + 6);
      ctx.fillStyle = "#c45c4a";
      for (let sy = doorTop; sy < baseY - 10; sy += 22) {
        ctx.beginPath();
        ctx.moveTo(colX + 1, sy + 10);
        ctx.lineTo(colX + 17, sy);
        ctx.lineTo(colX + 17, sy + 8);
        ctx.lineTo(colX + 1, sy + 18);
        ctx.closePath();
        ctx.fill();
      }
    }

    // "2p slots" A-board out front
    ctx.fillStyle = "#fff8e8";
    ctx.beginPath();
    ctx.moveTo(doorR + 18, baseY);
    ctx.lineTo(doorR + 30, baseY - 34);
    ctx.lineTo(doorR + 42, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#1a1410";
    ctx.font = "bold 10px 'Comic Sans MS', cursive";
    ctx.fillText("2p", doorR + 30, baseY - 12);
  }, "#1a1410", 3);

  tex.refresh();
}

/** Eastney beach huts — candy-stripe chalets in a row along the shingle. */
function makeClarencePier(scene: Phaser.Scene): void {
  const w = 420;
  const h = 175;
  const tex = scene.textures.createCanvas("landmark_clarence_pier", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const deckY = h - 18;
  const huts: {
    x: number;
    body: string;
    stripe: string;
    roof: string;
    door: string;
  }[] = [
    { x: 12, body: "#f2ebe0", stripe: "#3a6db0", roof: "#2a4a78", door: "#2a4a78" },
    { x: 92, body: "#f7f0e8", stripe: "#c45c6a", roof: "#8a3040", door: "#8a3040" },
    { x: 172, body: "#fff8e8", stripe: "#d4a028", roof: "#8a6020", door: "#6a4a18" },
    { x: 252, body: "#eef6f0", stripe: "#2a8a6a", roof: "#1a5a48", door: "#1a5a48" },
    { x: 332, body: "#f6eef8", stripe: "#6a3a8a", roof: "#4a2868", door: "#4a2868" },
  ];

  scratchStroke(ctx, () => {
    // Shared timber deck / stilts over the shingle
    ctx.fillStyle = "#8a7060";
    ctx.fillRect(4, deckY, w - 8, 12);
    ctx.strokeRect(4, deckY, w - 8, 12);
    ctx.fillStyle = "#6a5448";
    for (let x = 18; x < w - 10; x += 28) {
      ctx.fillRect(x, deckY + 12, 5, 6);
      ctx.strokeRect(x, deckY + 12, 5, 6);
    }
    // Deck planks
    ctx.strokeStyle = "#5a4438";
    ctx.lineWidth = 1.2;
    for (let x = 10; x < w - 8; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, deckY + 1);
      ctx.lineTo(x, deckY + 11);
      ctx.stroke();
    }

    for (let i = 0; i < huts.length; i++) {
      const hut = huts[i]!;
      const hw = 72;
      const hh = 78 + (i % 2) * 4;
      const hx = hut.x;
      const hy = deckY - hh;

      // Body fill
      ctx.fillStyle = hut.body;
      ctx.fillRect(hx, hy, hw, hh);

      // Vertical stripes
      ctx.fillStyle = hut.stripe;
      const stripeW = 7;
      for (let sx = hx + 4; sx < hx + hw - 2; sx += stripeW * 2) {
        ctx.fillRect(sx, hy + 2, stripeW, hh - 4);
      }
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2.4;
      ctx.strokeRect(hx, hy, hw, hh);

      // Pitched roof with bargeboards
      ctx.fillStyle = hut.roof;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy + 2);
      ctx.lineTo(hx + hw / 2, hy - 22);
      ctx.lineTo(hx + hw + 6, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Ridge highlight
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy);
      ctx.lineTo(hx + hw / 2, hy - 18);
      ctx.stroke();
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2.4;

      // Door
      const dw = 22;
      const dh = 40;
      const dx = hx + (hw - dw) / 2;
      const dy = hy + hh - dh;
      ctx.fillStyle = hut.door;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeRect(dx, dy, dw, dh);
      // Door window
      ctx.fillStyle = "#c8e0f0";
      ctx.fillRect(dx + 5, dy + 6, 12, 10);
      ctx.strokeRect(dx + 5, dy + 6, 12, 10);
      // Handle
      ctx.beginPath();
      ctx.arc(dx + dw - 4, dy + dh * 0.55, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "#e8d080";
      ctx.fill();
      ctx.stroke();

      // Tiny side window
      ctx.fillStyle = "#c8e0f0";
      ctx.fillRect(hx + 8, hy + 18, 10, 12);
      ctx.strokeRect(hx + 8, hy + 18, 10, 12);

      // Number plaque
      ctx.fillStyle = "#f2e6d8";
      ctx.fillRect(hx + hw - 18, hy + 10, 12, 12);
      ctx.strokeRect(hx + hw - 18, hy + 10, 12, 12);
      ctx.fillStyle = "#1a1410";
      ctx.font = "bold 9px 'Comic Sans MS', cursive";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), hx + hw - 12, hy + 19);

      // Steps onto the deck
      ctx.fillStyle = "#9a8070";
      ctx.fillRect(dx - 2, deckY - 4, dw + 4, 4);
      ctx.strokeRect(dx - 2, deckY - 4, dw + 4, 4);
    }

    // Little railing along the front of the deck
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, deckY - 2);
    ctx.lineTo(w - 8, deckY - 2);
    ctx.stroke();
    for (let x = 16; x < w - 12; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, deckY - 2);
      ctx.lineTo(x, deckY + 8);
      ctx.stroke();
    }
  }, "#1a1410", 2.6);

  tex.refresh();
}

/** Concrete sea wall / tetrapods past South Parade — Level 2 stretch. */
function makeSeaDefences(scene: Phaser.Scene): void {
  const w = 280;
  const h = 110;
  const tex = scene.textures.createCanvas("landmark_sea_defences", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    // Water wash at the toe
    ctx.fillStyle = "rgba(40,90,110,0.28)";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h - 6, w * 0.46, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sloped concrete apron
    ctx.fillStyle = "#9aa0a4";
    ctx.beginPath();
    ctx.moveTo(4, h - 10);
    ctx.lineTo(18, h * 0.42);
    ctx.lineTo(w - 18, h * 0.42);
    ctx.lineTo(w - 4, h - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wall face
    ctx.fillStyle = "#7a8086";
    ctx.fillRect(14, h * 0.22, w - 28, h * 0.22);
    ctx.strokeRect(14, h * 0.22, w - 28, h * 0.22);
    // Expansion joints
    ctx.strokeStyle = "rgba(26,20,16,0.35)";
    ctx.lineWidth = 1.4;
    for (let x = 40; x < w - 30; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.22);
      ctx.lineTo(x, h * 0.44);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.2;

    // Rail along the top
    ctx.fillStyle = "#3a4048";
    ctx.fillRect(10, h * 0.18, w - 20, 5);
    ctx.strokeRect(10, h * 0.18, w - 20, 5);
    for (let x = 22; x < w - 16; x += 22) {
      ctx.fillRect(x - 1.5, h * 0.1, 3, h * 0.1);
      ctx.strokeRect(x - 1.5, h * 0.1, 3, h * 0.1);
    }
    ctx.fillStyle = "#2a3038";
    ctx.fillRect(10, h * 0.08, w - 20, 4);
    ctx.strokeRect(10, h * 0.08, w - 20, 4);

    // Tetrapods on the seaward side
    const pod = (cx: number, cy: number, s: number) => {
      ctx.fillStyle = "#6a7076";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.7, cy);
      ctx.lineTo(cx, cy + s * 0.55);
      ctx.lineTo(cx - s * 0.7, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy - s * 0.2);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.35);
      ctx.moveTo(cx + s * 0.35, cy - s * 0.2);
      ctx.lineTo(cx - s * 0.55, cy + s * 0.35);
      ctx.stroke();
    };
    pod(48, h - 22, 14);
    pod(92, h - 18, 12);
    pod(w - 70, h - 20, 13);
    pod(w - 36, h - 16, 11);

    // Warning signs dropped / bolted onto the wall face (not floating plaques)
    const wallSign = (cx: number, cy: number, tilt: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      // Short stub post into the concrete
      ctx.fillStyle = "#4a5058";
      ctx.fillRect(-2, 6, 4, 10);
      ctx.strokeRect(-2, 6, 4, 10);
      // Yellow board resting on the wall
      ctx.fillStyle = "#e8c028";
      ctx.fillRect(-22, -10, 44, 18);
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -10, 44, 18);
      ctx.fillStyle = "#1a1410";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SEA WALL", 0, 2);
      ctx.textAlign = "start";
      // Bolt heads
      ctx.fillStyle = "#3a4048";
      ctx.beginPath();
      ctx.arc(-16, -6, 1.6, 0, Math.PI * 2);
      ctx.arc(16, -6, 1.6, 0, Math.PI * 2);
      ctx.arc(-16, 4, 1.6, 0, Math.PI * 2);
      ctx.arc(16, 4, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    wallSign(w * 0.32, h * 0.3, -0.08);
    wallSign(w * 0.72, h * 0.32, 0.12);
  }, "#1a1410", 2.2);

  tex.refresh();
}

/** Portsmouth Round Tower — stone drum between the sea walls. */
function makeRoundTower(scene: Phaser.Scene): void {
  const w = 160;
  const h = 168;
  const tex = scene.textures.createCanvas("landmark_round_tower", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    const cx = w * 0.5;
    const baseY = h - 8;

    // Shadow / water wash
    ctx.fillStyle = "rgba(40,90,110,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 2, 58, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(26,20,16,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 52, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Curtain wall stubs left / right (links to sea walls)
    ctx.fillStyle = "#7a8086";
    ctx.beginPath();
    ctx.moveTo(2, baseY - 4);
    ctx.lineTo(18, baseY - 48);
    ctx.lineTo(28, baseY - 48);
    ctx.lineTo(22, baseY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 2, baseY - 4);
    ctx.lineTo(w - 18, baseY - 48);
    ctx.lineTo(w - 28, baseY - 48);
    ctx.lineTo(w - 22, baseY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Drum body (perspective: wider ellipse at top rim)
    const bodyTop = 28;
    const bodyBot = baseY - 6;
    ctx.fillStyle = "#8a8478";
    ctx.beginPath();
    ctx.moveTo(cx - 48, bodyBot);
    ctx.quadraticCurveTo(cx - 54, (bodyTop + bodyBot) / 2, cx - 44, bodyTop + 18);
    ctx.lineTo(cx - 38, bodyTop + 8);
    ctx.quadraticCurveTo(cx, bodyTop - 2, cx + 38, bodyTop + 8);
    ctx.lineTo(cx + 44, bodyTop + 18);
    ctx.quadraticCurveTo(cx + 54, (bodyTop + bodyBot) / 2, cx + 48, bodyBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Stone course lines
    ctx.strokeStyle = "rgba(26,20,16,0.28)";
    ctx.lineWidth = 1.3;
    for (let y = bodyTop + 22; y < bodyBot - 8; y += 14) {
      ctx.beginPath();
      ctx.moveTo(cx - 42 + (y - bodyTop) * 0.04, y);
      ctx.lineTo(cx + 42 - (y - bodyTop) * 0.04, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.4;

    // Arrow slits / gun ports
    ctx.fillStyle = "#2a2820";
    for (const ox of [-22, 0, 22]) {
      ctx.fillRect(cx + ox - 4, bodyTop + 42, 8, 16);
      ctx.strokeRect(cx + ox - 4, bodyTop + 42, 8, 16);
    }

    // Door at base (seaward side)
    ctx.fillStyle = "#3a3830";
    ctx.beginPath();
    ctx.moveTo(cx - 10, bodyBot);
    ctx.lineTo(cx - 10, bodyBot - 28);
    ctx.quadraticCurveTo(cx, bodyBot - 36, cx + 10, bodyBot - 28);
    ctx.lineTo(cx + 10, bodyBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Parapet / battlements
    ctx.fillStyle = "#7a7468";
    ctx.beginPath();
    ctx.ellipse(cx, bodyTop + 10, 42, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Merlons
    for (let i = -3; i <= 3; i++) {
      const mx = cx + i * 11;
      ctx.fillRect(mx - 4, bodyTop - 2, 8, 12);
      ctx.strokeRect(mx - 4, bodyTop - 2, 8, 12);
    }
    // Inner walk ring (dark)
    ctx.fillStyle = "#4a4840";
    ctx.beginPath();
    ctx.ellipse(cx, bodyTop + 12, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Flag pole
    ctx.beginPath();
    ctx.moveTo(cx + 6, bodyTop - 2);
    ctx.lineTo(cx + 6, 6);
    ctx.lineTo(cx + 28, 12);
    ctx.lineTo(cx + 6, 16);
    ctx.stroke();
  }, "#1a1410", 2.6);

  tex.refresh();
}

/** Kids bombing off the Round Tower into the sea (north / up-screen). */
function makeTowerKidsJump(scene: Phaser.Scene): void {
  const w = 160;
  const h = 168;
  const cx = w * 0.5;
  const parapetY = 36;
  // Sea sits above the tower in world space — splash / swim up here
  const seaY = 10;

  const kid = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pose: "stand" | "wind" | "leap" | "dive" | "swim",
    shirt: string,
  ) => {
    ctx.save();
    ctx.translate(x, y);
    // Leap / dive tip toward the sea (up the canvas)
    if (pose === "leap") ctx.rotate(-0.55);
    if (pose === "dive") ctx.rotate(-1.05);
    if (pose === "swim") ctx.rotate(0.15);

    // Legs
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#3a4558";
    if (pose === "stand" || pose === "wind") {
      ctx.fillRect(-4, 4, 3, 8);
      ctx.fillRect(1, 4, 3, 8);
      ctx.strokeRect(-4, 4, 3, 8);
      ctx.strokeRect(1, 4, 3, 8);
    } else if (pose === "leap") {
      ctx.fillRect(-6, 2, 3, 7);
      ctx.fillRect(2, 0, 3, 8);
      ctx.strokeRect(-6, 2, 3, 7);
      ctx.strokeRect(2, 0, 3, 8);
    } else if (pose === "dive") {
      ctx.fillRect(-2, 6, 3, 8);
      ctx.fillRect(1, 5, 3, 9);
      ctx.strokeRect(-2, 6, 3, 8);
      ctx.strokeRect(1, 5, 3, 9);
    } else {
      ctx.fillRect(-5, 2, 4, 3);
      ctx.fillRect(2, 2, 4, 3);
      ctx.strokeRect(-5, 2, 4, 3);
      ctx.strokeRect(2, 2, 4, 3);
    }

    // Torso
    ctx.fillStyle = shirt;
    ctx.fillRect(-5, -6, 10, 11);
    ctx.strokeRect(-5, -6, 10, 11);

    // Arms
    ctx.fillStyle = "#d8b090";
    if (pose === "wind") {
      ctx.fillRect(-9, -8, 4, 3);
      ctx.fillRect(5, -10, 3, 6);
      ctx.strokeRect(-9, -8, 4, 3);
      ctx.strokeRect(5, -10, 3, 6);
    } else if (pose === "leap") {
      ctx.fillRect(-10, -4, 5, 3);
      ctx.fillRect(5, -6, 5, 3);
      ctx.strokeRect(-10, -4, 5, 3);
      ctx.strokeRect(5, -6, 5, 3);
    } else if (pose === "dive") {
      ctx.fillRect(-3, -12, 3, 7);
      ctx.fillRect(1, -12, 3, 7);
      ctx.strokeRect(-3, -12, 3, 7);
      ctx.strokeRect(1, -12, 3, 7);
    } else if (pose === "swim") {
      ctx.fillRect(-9, -2, 5, 3);
      ctx.fillRect(4, -4, 5, 3);
      ctx.strokeRect(-9, -2, 5, 3);
      ctx.strokeRect(4, -4, 5, 3);
    } else {
      ctx.fillRect(-7, -2, 3, 6);
      ctx.fillRect(4, -2, 3, 6);
      ctx.strokeRect(-7, -2, 3, 6);
      ctx.strokeRect(4, -2, 3, 6);
    }

    // Head
    ctx.fillStyle = "#e8c8a8";
    ctx.beginPath();
    ctx.arc(0, -10, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Hair
    ctx.fillStyle = pose === "stand" ? "#2a2018" : "#3a2818";
    ctx.beginPath();
    ctx.arc(-1, -12, 3.2, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  };

  const splash = (ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean) => {
    ctx.strokeStyle = "#7ec8de";
    ctx.lineWidth = 2;
    const n = big ? 7 : 4;
    for (let i = 0; i < n; i++) {
      // Spray mostly upward into the Solent
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.38;
      const len = (big ? 14 : 8) + (i % 2) * 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120,190,210,0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y + 1, big ? 16 : 10, big ? 5 : 3, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const frames: { key: string; draw: (ctx: CanvasRenderingContext2D) => void }[] = [
    {
      key: "tower_kids_0",
      draw: (ctx) => {
        // On the parapet, winding up for a sea bomb
        kid(ctx, cx - 14, parapetY, "stand", "#c45c4a");
        kid(ctx, cx + 6, parapetY - 2, "wind", "#3a6db0");
        kid(ctx, cx + 28, parapetY + 2, "stand", "#e8a030");
      },
    },
    {
      key: "tower_kids_1",
      draw: (ctx) => {
        kid(ctx, cx - 14, parapetY, "stand", "#c45c4a");
        // Off the seaward lip — up toward the Solent
        kid(ctx, cx + 10, parapetY - 26, "leap", "#3a6db0");
        kid(ctx, cx + 28, parapetY + 2, "wind", "#e8a030");
      },
    },
    {
      key: "tower_kids_2",
      draw: (ctx) => {
        kid(ctx, cx - 10, parapetY - 2, "wind", "#c45c4a");
        kid(ctx, cx + 4, seaY + 8, "dive", "#3a6db0");
        kid(ctx, cx + 30, parapetY + 4, "stand", "#e8a030");
        splash(ctx, cx + 2, seaY + 2, false);
      },
    },
    {
      key: "tower_kids_3",
      draw: (ctx) => {
        kid(ctx, cx - 4, parapetY - 22, "leap", "#c45c4a");
        kid(ctx, cx + 8, seaY + 4, "swim", "#3a6db0");
        kid(ctx, cx + 32, parapetY, "wind", "#e8a030");
        splash(ctx, cx + 6, seaY, true);
      },
    },
  ];

  for (const f of frames) {
    const tex = scene.textures.createCanvas(f.key, w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => f.draw(ctx), "#1a1410", 2);
    tex.refresh();
  }
}

/** Clarence Pier funfair — Level 2 destination (big wheel, stalls, lights). */
function makeClarenceFunfair(scene: Phaser.Scene): void {
  const w = 480;
  const h = 260;
  const tex = scene.textures.createCanvas("landmark_clarence_funfair", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    // Soft ground wash / shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(w * 0.52, h - 6, w * 0.48, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boardwalk deck
    ctx.fillStyle = "#9a7a5e";
    ctx.fillRect(4, h - 22, w - 8, 16);
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.2;
    ctx.strokeRect(4, h - 22, w - 8, 16);
    ctx.strokeStyle = "#6a5040";
    ctx.lineWidth = 1.2;
    for (let x = 12; x < w - 8; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, h - 21);
      ctx.lineTo(x, h - 7);
      ctx.stroke();
    }
    // stilts into the shingle
    ctx.fillStyle = "#6a5448";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 1.8;
    for (let x = 28; x < w - 20; x += 48) {
      ctx.fillRect(x, h - 6, 6, 6);
      ctx.strokeRect(x, h - 6, 6, 6);
    }

    // —— Big wheel (left) ——
    const wx = w * 0.26;
    const wy = h * 0.4;
    const wr = 68;
    // legs
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(wx - 10, wy + 10);
    ctx.lineTo(wx - 38, h - 22);
    ctx.moveTo(wx + 10, wy + 10);
    ctx.lineTo(wx + 38, h - 22);
    ctx.moveTo(wx - 42, h - 22);
    ctx.lineTo(wx + 42, h - 22);
    ctx.stroke();
    // rims
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, wr * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, wr * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    const gondolaCols = ["#c02828", "#3a6db0", "#e8b43c", "#2a8a6a", "#c45c6a", "#4a6a9a", "#d4a028", "#6a3a8a"];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - 0.2;
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr);
      ctx.stroke();
      const gx = wx + Math.cos(a) * wr * 0.88;
      const gy = wy + Math.sin(a) * wr * 0.88;
      ctx.fillStyle = gondolaCols[i % gondolaCols.length]!;
      ctx.fillRect(gx - 6, gy - 5, 12, 10);
      ctx.strokeRect(gx - 6, gy - 5, 12, 10);
      ctx.fillStyle = "rgba(242,230,216,0.75)";
      ctx.fillRect(gx - 4, gy - 3, 8, 5);
    }
    // hub
    ctx.fillStyle = "#e8dcc8";
    ctx.beginPath();
    ctx.arc(wx, wy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // —— Helter-skelter (centre) ——
    const hx = w * 0.52;
    const towerTop = h * 0.1;
    const towerBot = h - 22;
    ctx.fillStyle = "#e8e0d0";
    ctx.fillRect(hx - 14, towerTop + 18, 28, towerBot - towerTop - 18);
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.2;
    ctx.strokeRect(hx - 14, towerTop + 18, 28, towerBot - towerTop - 18);
    // conical roof
    ctx.fillStyle = "#c02828";
    ctx.beginPath();
    ctx.moveTo(hx - 22, towerTop + 22);
    ctx.lineTo(hx, towerTop);
    ctx.lineTo(hx + 22, towerTop + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // spiral slide
    ctx.strokeStyle = "#c02828";
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const y0 = towerTop + 28 + i * 18;
      const side = i % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(hx + side * 14, y0);
      ctx.quadraticCurveTo(hx + side * 36, y0 + 8, hx - side * 14, y0 + 16);
      ctx.stroke();
    }
    // exit chute
    ctx.fillStyle = "#c02828";
    ctx.beginPath();
    ctx.moveTo(hx + 14, towerBot - 28);
    ctx.quadraticCurveTo(hx + 48, towerBot - 18, hx + 44, towerBot - 4);
    ctx.lineTo(hx + 28, towerBot - 4);
    ctx.quadraticCurveTo(hx + 30, towerBot - 16, hx + 14, towerBot - 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.stroke();

    // —— Entrance arch (right of centre) ——
    const ax = w * 0.72;
    ctx.fillStyle = "#1a4060";
    ctx.fillRect(ax - 40, h * 0.42, 16, h - 22 - h * 0.42);
    ctx.fillRect(ax + 24, h * 0.42, 16, h - 22 - h * 0.42);
    ctx.strokeRect(ax - 40, h * 0.42, 16, h - 22 - h * 0.42);
    ctx.strokeRect(ax + 24, h * 0.42, 16, h - 22 - h * 0.42);
    ctx.beginPath();
    ctx.moveTo(ax - 44, h * 0.44);
    ctx.quadraticCurveTo(ax, h * 0.28, ax + 44, h * 0.44);
    ctx.lineTo(ax + 40, h * 0.5);
    ctx.quadraticCurveTo(ax, h * 0.36, ax - 40, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8b43c";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("FUNFAIR", ax - 24, h * 0.42);

    // —— Candy / ticket stalls ——
    const stalls: { x: number; roof: string; label: string }[] = [
      { x: w * 0.78, roof: "#c02828", label: "WIN" },
      { x: w * 0.9, roof: "#3a6db0", label: "EATS" },
    ];
    for (const st of stalls) {
      ctx.fillStyle = "#f2e6d8";
      ctx.fillRect(st.x - 26, h * 0.52, 52, 46);
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2;
      ctx.strokeRect(st.x - 26, h * 0.52, 52, 46);
      // scalloped awning
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? st.roof : "#f2e6d8";
        ctx.beginPath();
        ctx.arc(st.x - 22 + i * 9, h * 0.52, 5, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = st.roof;
      ctx.fillRect(st.x - 26, h * 0.46, 52, 10);
      ctx.strokeRect(st.x - 26, h * 0.46, 52, 10);
      // counter window
      ctx.fillStyle = "#1a1410";
      ctx.fillRect(st.x - 18, h * 0.58, 36, 14);
      ctx.fillStyle = "#f2e6d8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(st.label, st.x - 12, h * 0.68);
    }

    // Bumper-car shed hint behind stalls
    ctx.fillStyle = "#6a7a4a";
    ctx.fillRect(w * 0.62, h * 0.58, 36, 28);
    ctx.strokeStyle = "#1a1410";
    ctx.strokeRect(w * 0.62, h * 0.58, 36, 28);
    ctx.fillStyle = "#e8b43c";
    ctx.font = "bold 8px sans-serif";
    ctx.fillText("DODGEMS", w * 0.625, h * 0.7);

    // Main neon sign
    ctx.fillStyle = "#1a4060";
    ctx.fillRect(w * 0.38, 4, 150, 26);
    ctx.strokeStyle = "#e8b43c";
    ctx.lineWidth = 2.4;
    ctx.strokeRect(w * 0.38, 4, 150, 26);
    ctx.fillStyle = "#f2e6d8";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("CLARENCE PIER", w * 0.4, 22);

    // String lights across the site
    ctx.strokeStyle = "rgba(232,180,60,0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(16, h * 0.34);
    ctx.quadraticCurveTo(w * 0.4, h * 0.22, w - 18, h * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, h * 0.48);
    ctx.quadraticCurveTo(w * 0.55, h * 0.4, w - 30, h * 0.5);
    ctx.stroke();
    const bulbCols = ["#e8b43c", "#c02828", "#6ec8ff", "#f2e6d8"];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const lx = 16 + (w - 34) * t;
      const ly = h * 0.34 - Math.sin(t * Math.PI) * 18;
      ctx.fillStyle = bulbCols[i % bulbCols.length]!;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tiny crowd silhouettes on the deck
    ctx.fillStyle = "#1a1410";
    for (const px of [70, 110, 200, 250, 310, 400, 440]) {
      const ph = 10 + (px % 7);
      ctx.beginPath();
      ctx.ellipse(px, h - 28 - ph, 4, ph, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, h - 28 - ph * 2 + 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flags on poles
    for (const fx of [w * 0.08, w * 0.95]) {
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, h - 22);
      ctx.lineTo(fx, h * 0.2);
      ctx.stroke();
      ctx.fillStyle = fx < w * 0.5 ? "#c02828" : "#3a6db0";
      ctx.beginPath();
      ctx.moveTo(fx, h * 0.2);
      ctx.lineTo(fx + 18, h * 0.24);
      ctx.lineTo(fx, h * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }, "#1a1410", 2.4);

  tex.refresh();
}

/**
 * Hovertravel pad — apron toward the Solent, hut. Craft is a separate sprite
 * (stern to the promenade — you only see the back / fans).
 */
function makeHovercraftPort(scene: Phaser.Scene): void {
  const w = 420;
  const h = 220;
  const tex = scene.textures.createCanvas("landmark_hovercraft_port", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    // Concrete apron — ramp edge toward the sea (top of canvas)
    ctx.fillStyle = "#8a8a82";
    ctx.beginPath();
    ctx.moveTo(40, h - 12);
    ctx.lineTo(w - 40, h - 12);
    ctx.lineTo(w - 70, 70);
    ctx.lineTo(70, 70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#6a6a62";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const t = 0.15 + i * 0.16;
      ctx.beginPath();
      ctx.moveTo(50 + t * (w - 100), h - 14);
      ctx.lineTo(80 + t * (w - 160), 74);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.2;

    // Slip into the Solent
    ctx.fillStyle = "#7a7a72";
    ctx.beginPath();
    ctx.moveTo(90, 72);
    ctx.lineTo(w - 90, 72);
    ctx.lineTo(w - 120, 28);
    ctx.lineTo(120, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Terminal hut (landward side)
    ctx.fillStyle = "#d8d0c4";
    ctx.fillRect(w - 130, h - 100, 90, 64);
    ctx.strokeRect(w - 130, h - 100, 90, 64);
    ctx.fillStyle = "#3a5a8a";
    ctx.beginPath();
    ctx.moveTo(w - 136, h - 98);
    ctx.lineTo(w - 85, h - 122);
    ctx.lineTo(w - 34, h - 98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(w - 108, h - 70, 20, 32);
    ctx.strokeRect(w - 108, h - 70, 20, 32);
    ctx.fillStyle = "#7ec8e8";
    ctx.fillRect(w - 74, h - 86, 22, 16);
    ctx.strokeRect(w - 74, h - 86, 22, 16);
    ctx.fillStyle = "#f2e6d8";
    ctx.fillRect(w - 126, h - 110, 82, 14);
    ctx.strokeRect(w - 126, h - 110, 82, 14);
    ctx.fillStyle = "#1a1410";
    ctx.font = "bold 9px Comic Sans MS, cursive";
    ctx.fillText("HOVERTRAVEL", w - 120, h - 99);

    // Bollards along the apron
    ctx.fillStyle = "#5a5a5a";
    for (const x of [100, 150, 200, 250, 300]) {
      ctx.fillRect(x, h - 36, 5, 18);
      ctx.strokeRect(x, h - 36, 5, 18);
    }
    ctx.beginPath();
    ctx.moveTo(100, h - 30);
    ctx.lineTo(305, h - 30);
    ctx.stroke();
  }, "#1a1410", 2.2);
  tex.refresh();

  for (const frame of [0, 1] as const) {
    const key = `hovercraft_${frame}`;
    // True stern-on — only the back faces the promenade (fans high, skirt low)
    const cw = 200;
    const ch = 170;
    const ht = scene.textures.createCanvas(key, cw, ch)!;
    const c = ht.getContext();
    c.clearRect(0, 0, cw, ch);
    scratchStroke(c, () => {
      const cx = cw * 0.5;

      // Thin roof lip at the very top (bow is away — you barely see it)
      c.fillStyle = "#c8c4bc";
      c.beginPath();
      c.moveTo(cx - 52, 18);
      c.lineTo(cx + 52, 18);
      c.lineTo(cx + 58, 28);
      c.lineTo(cx - 58, 28);
      c.closePath();
      c.fill();
      c.stroke();

      // Flat stern wall — the only face you really see
      c.fillStyle = "#e8e4dc";
      c.beginPath();
      c.moveTo(cx - 72, 28);
      c.lineTo(cx + 72, 28);
      c.lineTo(cx + 78, 128);
      c.lineTo(cx - 78, 128);
      c.closePath();
      c.fill();
      c.stroke();

      // Soft vertical panels so it reads as a rear bulkhead, not a side hull
      c.strokeStyle = "rgba(26,20,16,0.25)";
      c.lineWidth = 1.4;
      for (const x of [cx - 36, cx, cx + 36]) {
        c.beginPath();
        c.moveTo(x, 32);
        c.lineTo(x + (x - cx) * 0.04, 126);
        c.stroke();
      }
      c.strokeStyle = "#1a1410";
      c.lineWidth = 2.2;

      const drawFan = (fx: number, fy: number, phase: number) => {
        // Duct housing — high on the stern
        c.fillStyle = "#5a5a58";
        c.beginPath();
        c.arc(fx, fy, 30, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = "#2a2a2a";
        c.beginPath();
        c.arc(fx, fy, 24, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.strokeStyle = "#c8c4b8";
        c.lineWidth = 3;
        c.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          const a = phase + (i * Math.PI) / 2;
          c.beginPath();
          c.moveTo(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4);
          c.lineTo(fx + Math.cos(a) * 20, fy + Math.sin(a) * 20);
          c.stroke();
        }
        c.fillStyle = "#1a1410";
        c.beginPath();
        c.arc(fx, fy, 4.5, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#1a1410";
        c.lineWidth = 2.3;
        c.beginPath();
        c.arc(fx, fy, 30, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = "rgba(26,20,16,0.35)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(fx, fy, 18, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = "#1a1410";
        c.lineWidth = 2.2;
      };
      const phase = frame === 0 ? 0.15 : 0.15 + Math.PI / 4;
      // Twin ducts near the top of the stern face
      drawFan(cx - 38, 52, phase);
      drawFan(cx + 38, 52, phase + 0.45);

      // Rear windows under the fans
      c.fillStyle = "#3a6aaa";
      c.fillRect(cx - 48, 88, 30, 20);
      c.fillRect(cx - 8, 86, 34, 22);
      c.fillRect(cx + 32, 88, 24, 20);
      c.strokeRect(cx - 48, 88, 30, 20);
      c.strokeRect(cx - 8, 86, 34, 22);
      c.strokeRect(cx + 32, 88, 24, 20);
      c.fillStyle = "#8ec8e8";
      c.fillRect(cx - 44, 92, 20, 10);
      c.fillRect(cx - 2, 90, 22, 12);
      c.fillRect(cx + 36, 92, 14, 10);

      // Red rear stripe + name
      c.fillStyle = "#c02828";
      c.fillRect(cx - 60, 114, 120, 10);
      c.strokeRect(cx - 60, 114, 120, 10);
      c.fillStyle = "#f2e6d8";
      c.font = "bold 11px Comic Sans MS, cursive";
      c.fillText("HOVERTRAVEL", cx - 42, 123);

      // Rubber skirt under the stern
      c.fillStyle = "#3a3a38";
      c.beginPath();
      c.ellipse(cx, 142, 82, 16, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = "#2a2a28";
      c.beginPath();
      c.ellipse(cx, 148, 74, 10, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }, "#1a1410", 2.2);
    ht.refresh();
  }
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

/** The Pyramids leisure centre — white block + three glass pyramid roofs. */
function makePyramids(scene: Phaser.Scene): void {
  const w = 240;
  const h = 150;
  const tex = scene.textures.createCanvas("landmark_pyramids", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  scratchStroke(ctx, () => {
    const baseL = 18;
    const baseR = w - 18;
    const baseTop = 88;
    const baseBot = 138;
    const mid = (baseL + baseR) / 2;

    // Ground shadow under the block
    ctx.fillStyle = "rgba(26,20,16,0.18)";
    ctx.beginPath();
    ctx.ellipse(mid, baseBot + 4, 96, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cream / white brick body
    ctx.fillStyle = "#e8e4d8";
    ctx.beginPath();
    ctx.moveTo(baseL, baseTop);
    ctx.lineTo(baseR, baseTop);
    ctx.lineTo(baseR - 4, baseBot);
    ctx.lineTo(baseL + 4, baseBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blue glass curtain band across the front
    ctx.fillStyle = "rgba(110,170,200,0.75)";
    ctx.fillRect(baseL + 10, baseTop + 10, baseR - baseL - 20, 28);
    ctx.strokeRect(baseL + 10, baseTop + 10, baseR - baseL - 20, 28);
    // Pane mullions
    ctx.beginPath();
    for (let x = baseL + 34; x < baseR - 20; x += 22) {
      ctx.moveTo(x, baseTop + 10);
      ctx.lineTo(x, baseTop + 38);
    }
    ctx.moveTo(baseL + 10, baseTop + 24);
    ctx.lineTo(baseR - 10, baseTop + 24);
    ctx.stroke();

    // Glass highlight
    ctx.strokeStyle = "rgba(240,250,255,0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(baseL + 14, baseTop + 14);
    ctx.lineTo(baseL + 50, baseTop + 14);
    ctx.stroke();
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 3;

    // Entrance canopy + doors (centre)
    const doorW = 28;
    const doorH = 34;
    const doorX = mid - doorW / 2;
    const doorY = baseBot - doorH;
    ctx.fillStyle = "#c8d8e4";
    ctx.fillRect(doorX - 10, baseTop + 36, doorW + 20, 8);
    ctx.strokeRect(doorX - 10, baseTop + 36, doorW + 20, 8);
    // Canopy triangle
    ctx.fillStyle = "#d0dce8";
    ctx.beginPath();
    ctx.moveTo(doorX - 14, baseTop + 36);
    ctx.lineTo(mid, baseTop + 22);
    ctx.lineTo(doorX + doorW + 14, baseTop + 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a6a88";
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeRect(doorX, doorY, doorW, doorH);
    ctx.beginPath();
    ctx.moveTo(mid, doorY);
    ctx.lineTo(mid, doorY + doorH);
    ctx.stroke();
    // Door handles
    ctx.fillStyle = "#e8d080";
    ctx.beginPath();
    ctx.arc(mid - 4, doorY + doorH * 0.55, 1.8, 0, Math.PI * 2);
    ctx.arc(mid + 4, doorY + doorH * 0.55, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Side windows low on the block
    ctx.fillStyle = "rgba(120,180,210,0.65)";
    for (const wx of [baseL + 16, baseR - 34]) {
      ctx.fillRect(wx, baseTop + 48, 18, 14);
      ctx.strokeRect(wx, baseTop + 48, 18, 14);
    }

    // Sign board
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(mid - 42, baseTop - 2, 84, 14);
    ctx.strokeRect(mid - 42, baseTop - 2, 84, 14);
    ctx.fillStyle = "#f2e6d8";
    ctx.font = "bold 9px 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PYRAMIDS", mid, baseTop + 5);
    ctx.textBaseline = "alphabetic";

    // Three glass pyramid roofs — middle one tallest (the real silhouette)
    const peaks: { cx: number; peakH: number; half: number }[] = [
      { cx: mid - 62, peakH: 62, half: 34 },
      { cx: mid, peakH: 78, half: 40 },
      { cx: mid + 62, peakH: 62, half: 34 },
    ];
    for (const p of peaks) {
      const apexY = baseTop - p.peakH;
      const left = p.cx - p.half;
      const right = p.cx + p.half;

      // Soft shadow face (right slope darker)
      ctx.fillStyle = "rgba(90,140,170,0.55)";
      ctx.beginPath();
      ctx.moveTo(p.cx, apexY);
      ctx.lineTo(right, baseTop);
      ctx.lineTo(p.cx, baseTop);
      ctx.closePath();
      ctx.fill();

      // Lit face (left)
      ctx.fillStyle = "rgba(170,210,230,0.88)";
      ctx.beginPath();
      ctx.moveTo(p.cx, apexY);
      ctx.lineTo(left, baseTop);
      ctx.lineTo(p.cx, baseTop);
      ctx.closePath();
      ctx.fill();

      // Outer outline
      ctx.beginPath();
      ctx.moveTo(left, baseTop);
      ctx.lineTo(p.cx, apexY);
      ctx.lineTo(right, baseTop);
      ctx.closePath();
      ctx.stroke();

      // Ridge + horizontal glass bands
      ctx.beginPath();
      ctx.moveTo(p.cx, apexY);
      ctx.lineTo(p.cx, baseTop);
      const bands = 4;
      for (let i = 1; i <= bands; i++) {
        const t = i / (bands + 1);
        const y = apexY + (baseTop - apexY) * t;
        const halfAt = p.half * t;
        ctx.moveTo(p.cx - halfAt, y);
        ctx.lineTo(p.cx + halfAt, y);
      }
      ctx.stroke();

      // Bright rim catch on the lit edge
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p.cx, apexY + 4);
      ctx.lineTo(left + 4, baseTop - 2);
      ctx.stroke();
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 3;
    }

    // Little flagpoles on the outer peaks
    for (const cx of [mid - 62, mid + 62]) {
      const tip = baseTop - 62;
      ctx.beginPath();
      ctx.moveTo(cx, tip);
      ctx.lineTo(cx, tip - 14);
      ctx.stroke();
      ctx.fillStyle = "#c04050";
      ctx.beginPath();
      ctx.moveTo(cx, tip - 14);
      ctx.lineTo(cx + 10, tip - 10);
      ctx.lineTo(cx, tip - 6);
      ctx.closePath();
      ctx.fill();
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

/** Palmerston Solent sea forts — circular iron/stone drums in the approaches. */
function makeSolentFort(scene: Phaser.Scene): void {
  type FortKind = "spitbank" | "horsesand" | "nomans";
  const specs: {
    kind: FortKind;
    key: string;
    w: number;
    h: number;
    tiers: 1 | 2;
    dazzle: boolean;
    helipad: boolean;
  }[] = [
    // Smallest, closest to harbour — one gun floor
    { kind: "spitbank", key: "solent_fort_spitbank", w: 86, h: 52, tiers: 1, dazzle: false, helipad: false },
    // Larger twin — two floors, leftover black/white dazzle patches
    { kind: "horsesand", key: "solent_fort_horsesand", w: 118, h: 64, tiers: 2, dazzle: true, helipad: false },
    // Other large twin — toward the Island, modern helipad hint
    { kind: "nomans", key: "solent_fort_nomans", w: 114, h: 62, tiers: 2, dazzle: false, helipad: true },
  ];

  for (const spec of specs) {
    const { w, h, tiers, dazzle, helipad, key } = spec;
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const waterY = h - 12;
    const baseRx = w * 0.42;
    const baseRy = h * (tiers === 2 ? 0.26 : 0.24);

    // Water blot under the drum
    {
      const blot = ctx.createRadialGradient(cx, waterY, 1, cx, waterY + 2, baseRx + 4);
      blot.addColorStop(0, "rgba(28,68,88,0.4)");
      blot.addColorStop(0.55, "rgba(50,110,130,0.16)");
      blot.addColorStop(1, "rgba(50,110,130,0)");
      ctx.fillStyle = blot;
      ctx.beginPath();
      ctx.ellipse(cx, waterY + 4, baseRx + 2, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(232,244,250,0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - baseRx, waterY + 1);
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        ctx.lineTo(cx - baseRx + baseRx * 2 * t, waterY + 1 + Math.sin(t * Math.PI * 3) * 1.3);
      }
      ctx.stroke();
    }

    scratchStroke(ctx, () => {
      const stone = tiers === 2 ? "#6e6a62" : "#7a766c";
      const stoneDark = "#4a4840";
      const iron = "#3a3c42";

      // Squat cylinder (shore view) — vertical walls, not a saucer stack
      const wallBot = waterY - 2;
      const wallH = tiers === 2 ? baseRy * 1.85 : baseRy * 1.45;
      const wallTop = wallBot - wallH;
      const rimRx = baseRx * 0.98;
      const rimRy = baseRy * 0.95;

      // Lower waterline ellipse (slightly wider footing)
      ctx.fillStyle = stone;
      ctx.beginPath();
      ctx.ellipse(cx, wallBot, baseRx, baseRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Vertical wall band — straight sides between floor and rim
      ctx.fillStyle = stoneDark;
      ctx.beginPath();
      ctx.moveTo(cx - rimRx, wallBot);
      ctx.lineTo(cx - rimRx, wallTop);
      // Top rim edge (left → right along the upper arc)
      ctx.ellipse(cx, wallTop, rimRx, rimRy, 0, Math.PI, 0, false);
      ctx.lineTo(cx + rimRx, wallBot);
      // Waterline front (right → left along the lower arc)
      ctx.ellipse(cx, wallBot, rimRx, baseRy, 0, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rim top (full ellipse so the drum reads circular)
      ctx.fillStyle = stone;
      ctx.beginPath();
      ctx.ellipse(cx, wallTop, rimRx, rimRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (tiers === 2) {
        // Upper gun floor — Horse Sand / No Man's Land (same cylinder language)
        const midBot = wallTop - 1;
        const midH = baseRy * 1.05;
        const midTop = midBot - midH;
        const midRx = rimRx * 0.78;
        const midRy = rimRy * 0.78;

        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.moveTo(cx - midRx, midBot);
        ctx.lineTo(cx - midRx, midTop);
        ctx.ellipse(cx, midTop, midRx, midRy, 0, Math.PI, 0, false);
        ctx.lineTo(cx + midRx, midBot);
        ctx.ellipse(cx, midBot, midRx, midRy, 0, 0, Math.PI, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = iron;
        ctx.beginPath();
        ctx.ellipse(cx, midTop, midRx, midRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Spitbank — single parapet + searchlight/gun roof stubs
        const parapetRx = rimRx * 0.7;
        const parapetRy = rimRy * 0.65;
        ctx.fillStyle = iron;
        ctx.beginPath();
        ctx.ellipse(cx, wallTop - 1, parapetRx, parapetRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2a2c30";
        ctx.fillRect(cx - 10, wallTop - parapetRy - 8, 7, 6);
        ctx.strokeRect(cx - 10, wallTop - parapetRy - 8, 7, 6);
        ctx.fillRect(cx + 4, wallTop - parapetRy - 7, 7, 5);
        ctx.strokeRect(cx + 4, wallTop - parapetRy - 7, 7, 5);
      }

      // Roof deck
      const roofY = tiers === 2 ? wallTop - baseRy * 1.15 : wallTop - rimRy * 0.35;
      const roofRx = tiers === 2 ? rimRx * 0.55 : rimRx * 0.62;
      ctx.fillStyle = "#5a5852";
      ctx.beginPath();
      ctx.ellipse(cx, roofY, roofRx, baseRy * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (helipad) {
        // No Man's Land — pale pad ring (luxury-era hint, still reads at distance)
        ctx.strokeStyle = "#d8d0c0";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, roofY - 1, roofRx * 0.55, baseRy * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 5, roofY - 1);
        ctx.lineTo(cx + 5, roofY - 1);
        ctx.stroke();
      }

      if (dazzle) {
        // Horse Sand — remnant black/white chequer dazzle on the seaward face
        ctx.fillStyle = "rgba(20,18,16,0.55)";
        ctx.fillRect(cx + rimRx * 0.18, wallTop + rimRy + 2, 8, 10);
        ctx.fillRect(cx + rimRx * 0.38, wallTop + rimRy + 6, 7, 9);
        ctx.fillStyle = "rgba(240,236,228,0.35)";
        ctx.fillRect(cx + rimRx * 0.28, wallTop + rimRy + 4, 7, 9);
        ctx.fillRect(cx + rimRx * 0.45, wallTop + rimRy + 1, 6, 8);
      }

      // Tiny flag / mast
      ctx.strokeStyle = "#1a1410";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + (helipad ? -8 : 6), roofY - 2);
      ctx.lineTo(cx + (helipad ? -8 : 6), roofY - 14);
      ctx.stroke();
      ctx.fillStyle = "#2a6db0";
      ctx.beginPath();
      ctx.moveTo(cx + (helipad ? -8 : 6), roofY - 14);
      ctx.lineTo(cx + (helipad ? -1 : 14), roofY - 11);
      ctx.lineTo(cx + (helipad ? -8 : 6), roofY - 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, "#1a1410", 2);

    tex.refresh();
  }

  // Legacy alias — same art as Spitbank so old refs don't blank
  if (scene.textures.exists("solent_fort_spitbank")) {
    const src = scene.textures.get("solent_fort_spitbank").getSourceImage() as HTMLCanvasElement;
    scene.textures.addCanvas("solent_fort", src);
  }
}

export type StallKind = "chips" | "icecream" | "doughnut" | "eels";

/** Seafront grub kiosks — trestle counter, striped awning, bloke behind it. */
function makeFoodStalls(scene: Phaser.Scene): void {
  const stalls: {
    kind: StallKind;
    body: string;
    awning: string;
    sign: string;
    hot: boolean;
  }[] = [
    { kind: "chips", body: "#d8d0c0", awning: "#c45c4a", sign: "CHIPS", hot: true },
    { kind: "icecream", body: "#e8f0f4", awning: "#3a6db0", sign: "ICES", hot: false },
    { kind: "doughnut", body: "#f0e0c8", awning: "#e8a030", sign: "DONUTS", hot: true },
    { kind: "eels", body: "#cfd8c8", awning: "#6a3a8a", sign: "EELS", hot: false },
  ];
  for (const s of stalls) makeFoodStall(scene, s);
}

function makeFoodStall(
  scene: Phaser.Scene,
  opts: { kind: StallKind; body: string; awning: string; sign: string; hot: boolean },
): void {
  const w = 160;
  const h = 150;
  const tex = scene.textures.createCanvas(`stall_${opts.kind}`, w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const baseY = h - 4;
  const counterTop = baseY - 46;
  const awningY = 34;

  scratchStroke(ctx, () => {
    // Awning posts
    ctx.fillStyle = "#8a7050";
    for (const px of [16, w - 22]) {
      ctx.fillRect(px, awningY, 6, counterTop - awningY + 6);
      ctx.strokeRect(px, awningY, 6, counterTop - awningY + 6);
    }

    // Scalloped striped awning
    const aw = w - 12;
    ctx.fillStyle = opts.awning;
    ctx.beginPath();
    ctx.moveTo(6, awningY);
    ctx.lineTo(w - 6, awningY);
    ctx.lineTo(w - 6, awningY + 16);
    for (let i = 6; i >= 1; i--) {
      const x0 = 6 + (i / 6) * aw;
      ctx.arc(x0 - aw / 12, awningY + 16, aw / 12, 0, Math.PI, false);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cream stripes
    ctx.fillStyle = "#f6ecd8";
    for (let i = 0; i < 6; i += 2) {
      const x0 = 6 + (i / 6) * aw;
      ctx.fillRect(x0, awningY + 1, aw / 6, 15);
    }
    ctx.beginPath();
    ctx.moveTo(6, awningY);
    ctx.lineTo(w - 6, awningY);
    ctx.stroke();

    // Sign board hung off the awning
    ctx.fillStyle = "#f0e040";
    ctx.fillRect(34, 4, w - 68, 26);
    ctx.strokeRect(34, 4, w - 68, 26);
    ctx.fillStyle = "#1a1410";
    ctx.font = "bold 17px 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.fillText(opts.sign, w / 2, 24);

    // Bloke behind the counter — apron, cap, hands on the hatch
    ctx.fillStyle = "#e8bb92";
    ctx.beginPath();
    ctx.arc(w / 2 + 22, counterTop - 34, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#3a6db0";
    ctx.beginPath();
    ctx.arc(w / 2 + 22, counterTop - 38, 13, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6ecd8";
    ctx.beginPath();
    ctx.moveTo(w / 2 + 4, counterTop);
    ctx.lineTo(w / 2 + 10, counterTop - 22);
    ctx.lineTo(w / 2 + 34, counterTop - 22);
    ctx.lineTo(w / 2 + 40, counterTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Eyes + a little grin
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 + 17, counterTop - 35);
    ctx.lineTo(w / 2 + 18, counterTop - 35);
    ctx.moveTo(w / 2 + 26, counterTop - 35);
    ctx.lineTo(w / 2 + 27, counterTop - 35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2 + 22, counterTop - 29, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Counter body with vertical stripes
    ctx.fillStyle = opts.body;
    ctx.fillRect(10, counterTop, w - 20, baseY - counterTop);
    ctx.lineWidth = 3;
    ctx.strokeRect(10, counterTop, w - 20, baseY - counterTop);
    ctx.strokeStyle = "rgba(26,20,16,0.35)";
    ctx.lineWidth = 2;
    for (let x0 = 22; x0 < w - 20; x0 += 14) {
      ctx.beginPath();
      ctx.moveTo(x0, counterTop + 4);
      ctx.lineTo(x0, baseY - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1410";

    // Counter slab
    ctx.fillStyle = "#8a7050";
    ctx.fillRect(4, counterTop - 8, w - 8, 10);
    ctx.lineWidth = 3;
    ctx.strokeRect(4, counterTop - 8, w - 8, 10);

    // Grub on the counter
    drawStallGoods(ctx, opts.kind, 40, counterTop - 8);

    // Steam off the hot stuff
    if (opts.hot) {
      ctx.lineWidth = 2;
      for (const sx of [34, 46]) {
        ctx.beginPath();
        ctx.moveTo(sx, counterTop - 30);
        ctx.quadraticCurveTo(sx + 7, counterTop - 40, sx, counterTop - 50);
        ctx.quadraticCurveTo(sx - 7, counterTop - 58, sx + 3, counterTop - 66);
        ctx.stroke();
      }
    }

    // Chalk crumbs / gull pecking at the base
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, baseY);
    ctx.lineTo(w - 14, baseY);
    ctx.stroke();
  }, "#1a1410", 3);

  tex.refresh();
}

function drawStallGoods(
  ctx: CanvasRenderingContext2D,
  kind: StallKind,
  x: number,
  y: number,
): void {
  ctx.lineWidth = 2.5;
  if (kind === "chips") {
    // Open chip tray with a fistful of chips and a vinegar bottle
    ctx.fillStyle = "#f6ecd8";
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x - 12, y - 18);
    ctx.lineTo(x + 12, y - 18);
    ctx.lineTo(x + 16, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8c040";
    for (let i = 0; i < 6; i++) {
      const cx = x - 10 + i * 4;
      ctx.save();
      ctx.translate(cx, y - 18);
      ctx.rotate((i - 3) * 0.16);
      ctx.fillRect(-2, -12, 4, 14);
      ctx.strokeRect(-2, -12, 4, 14);
      ctx.restore();
    }
    ctx.fillStyle = "#6a4a32";
    ctx.fillRect(x + 24, y - 22, 8, 22);
    ctx.strokeRect(x + 24, y - 22, 8, 22);
  } else if (kind === "icecream") {
    // Whippy with a flake
    ctx.fillStyle = "#d8a060";
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 14);
    ctx.lineTo(x + 8, y - 14);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fdfaf2";
    ctx.beginPath();
    ctx.arc(x, y - 20, 9, 0, Math.PI * 2);
    ctx.arc(x, y - 30, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6a4a32";
    ctx.save();
    ctx.translate(x + 5, y - 34);
    ctx.rotate(0.35);
    ctx.fillRect(-2, -14, 5, 16);
    ctx.strokeRect(-2, -14, 5, 16);
    ctx.restore();
  } else if (kind === "doughnut") {
    // Stack of sugared rings
    for (let i = 0; i < 3; i++) {
      const cy = y - 8 - i * 9;
      ctx.fillStyle = "#d89a52";
      ctx.beginPath();
      ctx.ellipse(x + (i % 2 ? 3 : -2), cy, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f6ecd8";
      ctx.beginPath();
      ctx.ellipse(x + (i % 2 ? 3 : -2), cy, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Tub of jellied eels with a plastic fork
    ctx.fillStyle = "#e8ecdc";
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x - 12, y - 20);
    ctx.lineTo(x + 12, y - 20);
    ctx.lineTo(x + 15, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#5a6a48";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const ex = x - 8 + i * 8;
      ctx.beginPath();
      ctx.moveTo(ex, y - 6);
      ctx.quadraticCurveTo(ex + 5, y - 12, ex - 1, y - 17);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 18);
    ctx.lineTo(x + 14, y - 32);
    ctx.stroke();
  }
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
  // Bike chain — unique shop melee
  {
    const tex = scene.textures.createCanvas("weapon_chain", 64, 18)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 64, 18);
    scratchStroke(ctx, () => {
      ctx.strokeStyle = "#6a6a72";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 9);
      for (let i = 0; i < 8; i++) {
        const x = 8 + i * 7;
        ctx.lineTo(x, i % 2 === 0 ? 5 : 13);
      }
      ctx.lineTo(60, 9);
      ctx.stroke();
      ctx.fillStyle = "#8a8a92";
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(10 + i * 7, i % 2 === 0 ? 6 : 12, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }, "#1a1410", 2);
    tex.refresh();
  }
  // Pool cue — unique shop melee
  {
    const tex = scene.textures.createCanvas("weapon_cue", 72, 14)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 72, 14);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#c4a06a";
      ctx.beginPath();
      ctx.moveTo(4, 6);
      ctx.lineTo(58, 4);
      ctx.lineTo(68, 5);
      ctx.lineTo(68, 9);
      ctx.lineTo(58, 10);
      ctx.lineTo(4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2a2a28";
      ctx.fillRect(62, 4, 6, 6);
      ctx.strokeRect(62, 4, 6, 6);
      ctx.fillStyle = "#8a4030";
      ctx.fillRect(4, 5, 10, 4);
    }, "#1a1410", 2.2);
    tex.refresh();
  }
  // Brass knuckles — unique shop melee
  {
    const tex = scene.textures.createCanvas("weapon_knuckle", 36, 28)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 36, 28);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#c0a040";
      ctx.fillRect(6, 16, 24, 6);
      ctx.strokeRect(6, 16, 24, 6);
      for (const x of [10, 18, 26]) {
        ctx.beginPath();
        ctx.arc(x, 12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.arc(x, 12, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c0a040";
      }
    }, "#1a1410", 2.2);
    tex.refresh();
  }

  // Dodgy weapons kiosk
  {
    const w = 140;
    const h = 150;
    const tex = scene.textures.createCanvas("stall_weapons", w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      ctx.fillStyle = "#3a3a42";
      ctx.fillRect(18, 48, 104, 90);
      ctx.strokeRect(18, 48, 104, 90);
      ctx.fillStyle = "#6a2020";
      ctx.beginPath();
      ctx.moveTo(10, 52);
      ctx.lineTo(70, 18);
      ctx.lineTo(130, 52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2a2a30";
      ctx.fillRect(40, 70, 60, 48);
      ctx.strokeRect(40, 70, 60, 48);
      ctx.fillStyle = "#f2e6d8";
      ctx.fillRect(28, 54, 84, 14);
      ctx.strokeRect(28, 54, 84, 14);
      ctx.fillStyle = "#1a1410";
      ctx.font = "bold 9px Comic Sans MS, cursive";
      ctx.fillText("ARCADE LOCKER", 34, 64);
      // Cue + chain hints in the window
      ctx.strokeStyle = "#b8894a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(48, 110);
      ctx.lineTo(92, 78);
      ctx.stroke();
      ctx.strokeStyle = "#8a8a92";
      ctx.beginPath();
      ctx.moveTo(52, 100);
      ctx.quadraticCurveTo(70, 88, 88, 102);
      ctx.stroke();
      ctx.fillStyle = "#4a3a2a";
      ctx.fillRect(88, 118, 18, 20);
      ctx.strokeRect(88, 118, 18, 20);
    }, "#1a1410", 2.2);
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
  makeSpitfire(scene);
  makeSkyDrone(scene);
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

function makeSpitfire(scene: Phaser.Scene): void {
  // Tiny doodle silhouette — elliptical wing, bubble canopy, facing right
  const w = 72;
  const h = 28;
  const tex = scene.textures.createCanvas("sky_spitfire", w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  scratchStroke(
    ctx,
    () => {
      const camo = "#4a5a3a";
      const belly = "#8a9a78";
      // Far elliptical wing (Spitfire trademark)
      ctx.fillStyle = camo;
      ctx.beginPath();
      ctx.ellipse(34, 15, 28, 5.5, 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Fuselage
      ctx.fillStyle = camo;
      ctx.beginPath();
      ctx.moveTo(8, 15);
      ctx.quadraticCurveTo(18, 10, 42, 11);
      ctx.quadraticCurveTo(58, 12, 64, 14);
      ctx.quadraticCurveTo(58, 17, 42, 18);
      ctx.quadraticCurveTo(22, 20, 10, 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Belly flash
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(36, 17, 16, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Near wing tip
      ctx.fillStyle = camo;
      ctx.beginPath();
      ctx.ellipse(38, 16, 22, 3.2, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tailplane
      ctx.beginPath();
      ctx.moveTo(10, 14);
      ctx.lineTo(4, 12);
      ctx.lineTo(4, 16);
      ctx.lineTo(10, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Fin
      ctx.beginPath();
      ctx.moveTo(12, 14);
      ctx.lineTo(6, 6);
      ctx.lineTo(14, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Bubble canopy
      ctx.fillStyle = "#6a8aaa";
      ctx.beginPath();
      ctx.ellipse(44, 11, 5, 3.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Spinner / prop blur
      ctx.strokeStyle = "#1a1410";
      ctx.beginPath();
      ctx.ellipse(66, 14, 2.5, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(66, 8);
      ctx.lineTo(66, 20);
      ctx.stroke();
      // Tiny roundel
      ctx.fillStyle = "#c43424";
      ctx.beginPath();
      ctx.arc(28, 14, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2e6d8";
      ctx.beginPath();
      ctx.arc(28, 14, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a4a8a";
      ctx.beginPath();
      ctx.arc(28, 14, 0.6, 0, Math.PI * 2);
      ctx.fill();
    },
    "#1a1410",
    1.6,
  );
  tex.refresh();
}

/** Quadcopter doodle — ambient flybys + Clarence Pier boss assist. */
function makeSkyDrone(scene: Phaser.Scene): void {
  for (const frame of [0, 1] as const) {
    const key = `sky_drone_${frame}`;
    const w = 64;
    const h = 40;
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    const spin = frame === 0 ? 0 : Math.PI / 4;
    scratchStroke(
      ctx,
      () => {
        const cx = 32;
        const cy = 22;
        // Arms
        ctx.strokeStyle = "#3a3a42";
        ctx.lineWidth = 2.4;
        for (const [ax, ay] of [
          [-16, -8],
          [16, -8],
          [-14, 8],
          [14, 8],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + ax, cy + ay);
          ctx.stroke();
        }
        // Body
        ctx.fillStyle = "#2a2a30";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 9, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Camera gimbal
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.arc(cx, cy + 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#4a8aaa";
        ctx.beginPath();
        ctx.arc(cx, cy + 8, 1.8, 0, Math.PI * 2);
        ctx.fill();
        // Rotors
        for (const [ax, ay] of [
          [-16, -8],
          [16, -8],
          [-14, 8],
          [14, 8],
        ] as const) {
          const px = cx + ax;
          const py = cy + ay;
          ctx.strokeStyle = "#8a8a92";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(px, py, 9, 2.2, spin + (ax < 0 ? 0.2 : -0.2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#4a4a52";
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#1a1410";
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        // LED
        ctx.fillStyle = frame === 0 ? "#c02828" : "#e06030";
        ctx.beginPath();
        ctx.arc(cx + 5, cy - 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      },
      "#1a1410",
      1.8,
    );
    tex.refresh();
  }
}

function makeSeagull(scene: Phaser.Scene): void {
  // Herring gull — white body, grey wings, yellow beak, black wingtip
  for (const [key, wing] of [
    ["prop_seagull_0", -14],
    ["prop_seagull_1", 1],
    ["prop_seagull_2", 14],
  ] as const) {
    const tex = scene.textures.createCanvas(key, 64, 40)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 64, 40);
    const cx = 30;
    const cy = 22;
    scratchStroke(ctx, () => {
      // Far wing (grey)
      ctx.fillStyle = "#9aa4b0";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 1);
      ctx.quadraticCurveTo(cx - 10, cy - 2 + wing * 0.35, cx - 26, cy + 4 - wing * 0.15);
      ctx.quadraticCurveTo(cx - 12, cy + 2 + wing * 0.2, cx - 2, cy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Near wing
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 1);
      ctx.quadraticCurveTo(cx + 14, cy - 3 + wing * 0.4, cx + 28, cy + 3 - wing * 0.2);
      ctx.quadraticCurveTo(cx + 16, cy + 3 + wing * 0.15, cx + 4, cy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Black wingtips
      ctx.fillStyle = "#1a1410";
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 2 - wing * 0.1);
      ctx.lineTo(cx - 26, cy + 4 - wing * 0.15);
      ctx.lineTo(cx - 18, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 24, cy + 1 - wing * 0.15);
      ctx.lineTo(cx + 28, cy + 3 - wing * 0.2);
      ctx.lineTo(cx + 20, cy + 3);
      ctx.closePath();
      ctx.fill();

      // Body
      ctx.fillStyle = "#f4f2ec";
      ctx.beginPath();
      ctx.ellipse(cx + 1, cy + 2, 8, 5.5, 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Head
      ctx.beginPath();
      ctx.arc(cx + 10, cy - 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Eye
      ctx.fillStyle = "#1a1410";
      ctx.beginPath();
      ctx.arc(cx + 11.5, cy - 2.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = "#e8a030";
      ctx.beginPath();
      ctx.moveTo(cx + 14, cy - 2);
      ctx.lineTo(cx + 22, cy - 1);
      ctx.lineTo(cx + 14, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Red beak spot
      ctx.fillStyle = "#c02828";
      ctx.beginPath();
      ctx.arc(cx + 16.5, cy - 0.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Tail
      ctx.fillStyle = "#f4f2ec";
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy + 1);
      ctx.lineTo(cx - 14, cy - 1);
      ctx.lineTo(cx - 12, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Feet tucked (when wings flatter)
      if (Math.abs(wing) < 6) {
        ctx.strokeStyle = "#e8a030";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 1, cy + 6);
        ctx.lineTo(cx - 1, cy + 10);
        ctx.moveTo(cx + 4, cy + 6);
        ctx.lineTo(cx + 4, cy + 10);
        ctx.stroke();
      }
    }, "#1a1410", 1.8);
    tex.refresh();
  }
}

function makeCar(scene: Phaser.Scene): void {
  // Sized against fighters (~84×92): a saloon should read ~2.5 people long
  const w = 240;
  const h = 110;

  const paint = (ctx: CanvasRenderingContext2D, stage: 0 | 1 | 2 | 3): void => {
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(w / 2, h - 5, 95, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      const body = stage >= 3 ? "#2a2a2a" : stage >= 2 ? "#4a3a3a" : stage >= 1 ? "#5a4540" : "#6a3a3a";
      ctx.fillStyle = body;
      // SF2-ish side profile saloon
      ctx.beginPath();
      ctx.moveTo(10, 74);
      ctx.lineTo(24, 48);
      ctx.lineTo(70, 40);
      ctx.lineTo(100, 22);
      ctx.lineTo(165, 22);
      ctx.lineTo(192, 42);
      ctx.lineTo(224, 50);
      ctx.lineTo(230, 82);
      ctx.lineTo(10, 82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Windows
      ctx.fillStyle = stage >= 2 ? "#3a4048" : "#9ec4d8";
      ctx.beginPath();
      ctx.moveTo(108, 28);
      ctx.lineTo(158, 28);
      ctx.lineTo(178, 46);
      ctx.lineTo(116, 46);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(76, 46);
      ctx.lineTo(110, 28);
      ctx.lineTo(110, 46);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (stage >= 1) {
        ctx.beginPath();
        ctx.moveTo(44, 56);
        ctx.quadraticCurveTo(58, 68, 74, 54);
        ctx.stroke();
      }
      if (stage >= 2) {
        ctx.beginPath();
        ctx.moveTo(120, 30);
        ctx.lineTo(150, 48);
        ctx.moveTo(150, 30);
        ctx.lineTo(120, 48);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(180, 56);
        ctx.lineTo(210, 70);
        ctx.stroke();
      }
      if (stage >= 3) {
        ctx.fillStyle = "#1a1410";
        ctx.fillRect(90, 26, 60, 10);
        ctx.beginPath();
        ctx.moveTo(28, 70);
        ctx.lineTo(58, 82);
        ctx.stroke();
      }

      // Wheels
      ctx.fillStyle = "#1a1410";
      ctx.beginPath();
      ctx.arc(56, 82, 16, 0, Math.PI * 2);
      ctx.arc(178, stage >= 3 ? 80 : 82, stage >= 3 ? 14 : 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(56, 82, 6, 0, Math.PI * 2);
      ctx.arc(178, stage >= 3 ? 80 : 82, 6, 0, Math.PI * 2);
      ctx.fill();

      // Bumper / lights
      ctx.fillStyle = stage >= 2 ? "#c8a050" : "#e8d080";
      ctx.fillRect(10, 62, 12, 12);
      ctx.strokeRect(10, 62, 12, 12);
      ctx.fillStyle = "#c04040";
      ctx.fillRect(218, 62, 10, 12);
      ctx.strokeRect(218, 62, 10, 12);
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

/** Ambient road passers — silhouettes distinct from the climbable parkers. */
function makePassingTraffic(scene: Phaser.Scene): void {
  const wheel = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ) => {
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  };

  const shadow = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
  ) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Compact hatch — stubbier roof, short boot
  {
    const w = 200;
    const h = 100;
    const tex = scene.textures.createCanvas("traffic_hatch", w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      shadow(ctx, w / 2, h - 4, 78);
      ctx.fillStyle = "#4a6a7a";
      ctx.beginPath();
      ctx.moveTo(12, 72);
      ctx.lineTo(28, 48);
      ctx.lineTo(55, 42);
      ctx.lineTo(78, 24);
      ctx.lineTo(145, 24);
      ctx.lineTo(168, 44);
      ctx.lineTo(188, 52);
      ctx.lineTo(190, 78);
      ctx.lineTo(12, 78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9ec4d8";
      ctx.beginPath();
      ctx.moveTo(86, 30);
      ctx.lineTo(138, 30);
      ctx.lineTo(152, 48);
      ctx.lineTo(92, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(62, 48);
      ctx.lineTo(84, 30);
      ctx.lineTo(88, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      wheel(ctx, 48, 78, 14);
      wheel(ctx, 148, 78, 14);
      ctx.fillStyle = "#e8d080";
      ctx.fillRect(12, 58, 10, 10);
      ctx.strokeRect(12, 58, 10, 10);
      ctx.fillStyle = "#c04040";
      ctx.fillRect(178, 58, 9, 10);
      ctx.strokeRect(178, 58, 9, 10);
    }, "#1a1410", 2.4);
    tex.refresh();
  }

  // White van — high box, Portsmouth tradesman energy
  {
    const w = 260;
    const h = 130;
    const tex = scene.textures.createCanvas("traffic_van", w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      shadow(ctx, w / 2, h - 4, 100);
      ctx.fillStyle = "#d8dce0";
      ctx.beginPath();
      ctx.moveTo(14, 88);
      ctx.lineTo(30, 38);
      ctx.lineTo(70, 28);
      ctx.lineTo(210, 28);
      ctx.lineTo(238, 42);
      ctx.lineTo(246, 96);
      ctx.lineTo(14, 96);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cab window
      ctx.fillStyle = "#7aa0b8";
      ctx.beginPath();
      ctx.moveTo(42, 40);
      ctx.lineTo(72, 34);
      ctx.lineTo(78, 62);
      ctx.lineTo(48, 64);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Side panel seam
      ctx.beginPath();
      ctx.moveTo(88, 32);
      ctx.lineTo(88, 92);
      ctx.stroke();
      wheel(ctx, 58, 96, 16);
      wheel(ctx, 198, 96, 16);
      ctx.fillStyle = "#e8d080";
      ctx.fillRect(14, 70, 12, 12);
      ctx.strokeRect(14, 70, 12, 12);
      ctx.fillStyle = "#c04040";
      ctx.fillRect(234, 70, 10, 12);
      ctx.strokeRect(234, 70, 10, 12);
    }, "#1a1410", 2.5);
    tex.refresh();
  }

  // E-scooter with rider — faces left like other traffic (stem/front on left).
  {
    const w = 110;
    const h = 100;
    const paint = (ctx: CanvasRenderingContext2D, frame: number) => {
      ctx.clearRect(0, 0, w, h);
      const rot = frame * 0.85;
      const deckY = h - 28;
      const frontX = 16;
      const rearX = w - 18;
      const hubY = h - 12;
      const stemBaseX = frontX + 2;
      const stemTopX = frontX;
      const gripY = 22;

      const spinWheel = (cx: number, cy: number, spin: number, radius: number) => {
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#d8d0c4";
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#7a786e";
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 3; i++) {
          const a = spin + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(
            cx + Math.cos(a) * (radius - 2.5),
            cy + Math.sin(a) * (radius - 2.5),
          );
          ctx.stroke();
        }
        ctx.strokeStyle = "#1a1410";
        ctx.lineWidth = 2.2;
        ctx.fillStyle = "#3a3a38";
        ctx.beginPath();
        ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      };

      scratchStroke(ctx, () => {
        shadow(ctx, w / 2, h - 4, 42);

        // Rider — standing, leaning toward bars (left)
        ctx.fillStyle = "#2a5080";
        ctx.beginPath();
        ctx.moveTo(48, 38);
        ctx.lineTo(62, 36);
        ctx.lineTo(60, deckY - 2);
        ctx.lineTo(46, deckY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Legs / feet on deck
        ctx.fillStyle = "#1a2438";
        ctx.beginPath();
        ctx.moveTo(48, deckY - 4);
        ctx.lineTo(58, deckY - 6);
        ctx.lineTo(64, deckY + 4);
        ctx.lineTo(42, deckY + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Arms to bars
        ctx.strokeStyle = "#1a1410";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(50, 44);
        ctx.lineTo(stemTopX + 8, gripY + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(56, 42);
        ctx.lineTo(stemTopX + 2, gripY + 4);
        ctx.stroke();
        // Head
        ctx.fillStyle = "#c4a882";
        ctx.beginPath();
        ctx.arc(52, 28, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.ellipse(50, 24, 7.5, 3.5, -0.15, Math.PI, Math.PI * 2);
        ctx.fill();

        // Deck board (front left → rear right)
        ctx.fillStyle = "#3d7a9a";
        ctx.beginPath();
        ctx.moveTo(frontX + 4, deckY);
        ctx.lineTo(rearX - 4, deckY + 1);
        ctx.quadraticCurveTo(rearX + 1, deckY + 2, rearX, deckY + 6);
        ctx.lineTo(frontX + 6, deckY + 7);
        ctx.quadraticCurveTo(frontX + 2, deckY + 4, frontX + 4, deckY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2a2a30";
        ctx.fillRect(frontX + 10, deckY + 2, rearX - frontX - 20, 3);

        // Stem / fork (front = left)
        ctx.strokeStyle = "#c45a2a";
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(stemBaseX, deckY + 2);
        ctx.lineTo(stemTopX, gripY + 8);
        ctx.stroke();
        ctx.strokeStyle = "#1a1410";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(stemBaseX, deckY + 2);
        ctx.lineTo(stemTopX, gripY + 8);
        ctx.stroke();
        ctx.strokeStyle = "#c45a2a";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(stemBaseX, deckY + 2);
        ctx.lineTo(frontX, hubY);
        ctx.stroke();
        ctx.strokeStyle = "#1a1410";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(stemBaseX, deckY + 2);
        ctx.lineTo(frontX, hubY);
        ctx.stroke();

        // T-bar reaches back toward rider
        ctx.strokeStyle = "#1a1410";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(stemTopX - 2, gripY + 1);
        ctx.lineTo(stemTopX + 22, gripY + 4);
        ctx.stroke();
        ctx.fillStyle = "#c45a2a";
        ctx.beginPath();
        ctx.arc(stemTopX + 2, gripY + 6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(stemTopX - 2, gripY + 1, 3, 0, Math.PI * 2);
        ctx.arc(stemTopX + 22, gripY + 4, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        spinWheel(frontX, hubY, rot, 7);
        spinWheel(rearX, hubY, rot + 0.4, 7);
      }, "#1a1410", 2.2);
    };

    for (const frame of [0, 1] as const) {
      const key = `traffic_scooter_${frame}`;
      const tex = scene.textures.createCanvas(key, w, h)!;
      paint(tex.getContext(), frame);
      tex.refresh();
    }
  }

  // Motorbike — longer, lower
  {
    const w = 140;
    const h = 85;
    const tex = scene.textures.createCanvas("traffic_bike", w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      shadow(ctx, w / 2, h - 3, 52);
      // Rider lean
      ctx.fillStyle = "#2a3040";
      ctx.beginPath();
      ctx.ellipse(68, 34, 11, 16, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c4a882";
      ctx.beginPath();
      ctx.arc(74, 18, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1a1410";
      ctx.beginPath();
      ctx.ellipse(74, 14, 6.5, 3.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Tank + seat
      ctx.fillStyle = "#6a3040";
      ctx.beginPath();
      ctx.moveTo(40, 52);
      ctx.lineTo(55, 40);
      ctx.lineTo(95, 42);
      ctx.lineTo(110, 54);
      ctx.lineTo(100, 60);
      ctx.lineTo(48, 58);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Forks
      ctx.beginPath();
      ctx.moveTo(42, 48);
      ctx.lineTo(28, 62);
      ctx.stroke();
      wheel(ctx, 30, 64, 13);
      wheel(ctx, 108, 64, 13);
      // Exhaust
      ctx.beginPath();
      ctx.moveTo(90, 58);
      ctx.lineTo(118, 62);
      ctx.stroke();
    }, "#1a1410", 2.2);
    tex.refresh();
  }

  // Mini coach / bus — long, rare
  {
    const w = 320;
    const h = 140;
    const tex = scene.textures.createCanvas("traffic_bus", w, h)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    scratchStroke(ctx, () => {
      shadow(ctx, w / 2, h - 4, 130);
      ctx.fillStyle = "#2a6a9a";
      ctx.beginPath();
      ctx.moveTo(12, 100);
      ctx.lineTo(20, 36);
      ctx.lineTo(50, 28);
      ctx.lineTo(280, 28);
      ctx.lineTo(304, 42);
      ctx.lineTo(308, 108);
      ctx.lineTo(12, 108);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Windows row
      ctx.fillStyle = "#9ec4d8";
      for (let i = 0; i < 5; i++) {
        const x = 58 + i * 42;
        ctx.fillRect(x, 40, 34, 28);
        ctx.strokeRect(x, 40, 34, 28);
      }
      // Cab window
      ctx.beginPath();
      ctx.moveTo(24, 42);
      ctx.lineTo(48, 34);
      ctx.lineTo(52, 68);
      ctx.lineTo(28, 70);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cream stripe
      ctx.fillStyle = "#f2e6d8";
      ctx.fillRect(14, 78, 290, 8);
      ctx.strokeRect(14, 78, 290, 8);
      wheel(ctx, 55, 108, 16);
      wheel(ctx, 140, 108, 14);
      wheel(ctx, 250, 108, 16);
      ctx.fillStyle = "#e8d080";
      ctx.fillRect(12, 84, 14, 12);
      ctx.strokeRect(12, 84, 14, 12);
      ctx.fillStyle = "#c04040";
      ctx.fillRect(296, 84, 10, 12);
      ctx.strokeRect(296, 84, 10, 12);
    }, "#1a1410", 2.6);
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
    "jump0",
    "jump1",
    "jump2",
    "jump_kick",
    "punch",
    "punch0",
    "punch1",
    "punch2",
    "jab",
    "jab0",
    "jab1",
    "jab2",
    "upper",
    "upper0",
    "upper1",
    "upper2",
    "backhand",
    "backhand0",
    "backhand1",
    "backhand2",
    "headbutt",
    "kick",
    "kick0",
    "kick1",
    "kick2",
    "stomp_up",
    "stomp",
    "weapon_swing",
    "weapon_swing0",
    "weapon_swing1",
    "weapon_swing2",
    "hurt",
    "hurt_head",
    "hold_gut",
    "limp_arm",
    "limp_leg",
    "down",
    "crawl0",
    "crawl1",
    "angry",
    "cuffed",
    "bloodied",
    "film",
    "phone",
    "phone0",
    "phone1",
    "phone2",
    "phone3",
    "block",
    "block0",
    "block1",
    "block2",
    "block3",
    "crouch",
    "ride0",
    "ride1",
    "ride_scooter0",
    "ride_scooter1",
    "skate0",
    "skate1",
    "ollie",
    "kickflip",
    "manual",
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
    "jump0",
    "jump1",
    "jump2",
    "jump_kick",
    "punch",
    "punch0",
    "punch1",
    "punch2",
    "jab",
    "jab0",
    "jab1",
    "jab2",
    "upper",
    "upper0",
    "upper1",
    "upper2",
    "backhand",
    "backhand0",
    "backhand1",
    "backhand2",
    "headbutt",
    "kick",
    "kick0",
    "kick1",
    "kick2",
    "stomp_up",
    "stomp",
    "weapon_swing",
    "weapon_swing0",
    "weapon_swing1",
    "weapon_swing2",
    "hurt",
    "hurt_head",
    "hold_gut",
    "limp_arm",
    "limp_leg",
    "down",
    "crawl0",
    "crawl1",
    "angry",
    "cuffed",
    "bloodied",
    "film",
    "phone",
    "phone0",
    "phone1",
    "phone2",
    "phone3",
    "block",
    "block0",
    "block1",
    "block2",
    "block3",
    "crouch",
    "ride0",
    "ride1",
    "ride_scooter0",
    "ride_scooter1",
    "skate0",
    "skate1",
    "ollie",
    "kickflip",
    "manual",
  ];

  for (const pose of poses) {
    const key = `${look.id}_${pose}`;
    const crawl = pose === "crawl0" || pose === "crawl1";
    const wide = pose === "down" || pose === "cuffed" || crawl;
    // Punch / swing arms reach past a normal frame — give them horizontal room
    const punchy =
      pose.startsWith("punch") ||
      pose.startsWith("jab") ||
      pose.startsWith("upper") ||
      pose.startsWith("kick") ||
      pose.startsWith("backhand") ||
      pose.startsWith("weapon_swing") ||
      pose === "jump_kick" ||
      pose === "stomp" ||
      pose === "stomp_up";
    const fw = wide ? 100 : punchy ? 140 : 84;
    // Custodian helmet needs a bit of headroom
    const fh = wide ? 56 : look.kit === "police" ? 100 : 92;
    const tex = scene.textures.createCanvas(key, fw, fh)!;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, fw, fh);
    if (crawl) {
      drawSorCrawl(ctx, fw, fh, look.skin, look.shirt, pose === "crawl0" ? 0.25 : 0.75, false, {
        pants: look.pants,
        hair: look.hair,
        build: look.build,
        present: look.present,
        hairStyle: look.hairStyle,
        kit: look.kit,
      });
    } else if (wide) {
      drawSorDown(ctx, fw, fh, look.skin, look.shirt, pose === "cuffed", false, {
        pants: look.pants,
        hair: look.hair,
        build: look.build,
        present: look.present,
        hairStyle: look.hairStyle,
        kit: look.kit,
      });
    } else {
      drawSorFighter(ctx, fw / 2, fh - 4, look.skin, look.shirt, pose, {
        hair: look.hair,
        pants: look.pants,
        build: look.build,
        present: look.present,
        hairStyle: look.hairStyle,
        bottom: look.bottom,
        kit: look.kit,
        bloodied: pose === "bloodied",
      });
    }
    tex.refresh();
  }
}

// landmark doodles still use wobble
void wobble;
