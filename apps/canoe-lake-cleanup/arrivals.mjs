import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto('http://127.0.0.1:5177/');
await page.waitForTimeout(2000);

// Watch every list that can gain or lose somebody, and flag any change that
// happened while the player could see the spot.
await page.evaluate(() => {
  const g = window.__game;
  g.player.locked = true;
  window.__seen = new Map();
  window.__log = [];

  const lists = {
    cyclist: () => g.cyclists,
    scooter: () => g.scooters,
    crabber: () => g.crabbers,
    boat: () => g.boats,
    gull: () => g.gulls,
    branchKid: () => g.branchKids,
    duck: () => g.ducks,
    swan: () => g.swans,
    graffiti: () => g.graffiti,
  };

  const spot = (thing) => {
    const p = thing.getPosition ? thing.getPosition() : thing.group.position;
    return { x: p.x, y: p.y ?? 0, z: p.z };
  };

  let first = true;
  const tick = () => {
    for (const [name, get] of Object.entries(lists)) {
      const now = new Set(get());
      const before = window.__seen.get(name) ?? new Set();
      for (const thing of now) {
        if (before.has(thing) || first) continue;
        const at = spot(thing);
        if (g.inShot(at.x, at.z, at.y)) {
          window.__log.push(`${name} APPEARED in shot at ${at.x.toFixed(0)},${at.z.toFixed(0)}`);
        }
      }
      for (const thing of before) {
        if (now.has(thing)) continue;
        const at = window.__last?.get(thing);
        if (at && g.inShot(at.x, at.z, at.y)) {
          window.__log.push(`${name} VANISHED in shot at ${at.x.toFixed(0)},${at.z.toFixed(0)}`);
        }
      }
      window.__seen.set(name, now);
    }
    // Remember where everyone was, so a vanish can be judged on its last spot.
    const last = new Map();
    for (const get of Object.values(lists)) for (const thing of get()) last.set(thing, spot(thing));
    window.__last = last;
    first = false;
    requestAnimationFrame(tick);
  };
  tick();
});

// Sweep the view around now and then, the way a player would.
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(6000);
  await page.evaluate((n) => {
    const g = window.__game;
    g.camera.rotation.y = n * 0.7;
  }, i);
}

const out = await page.evaluate(() => {
  const g = window.__game;
  return {
    log: window.__log,
    counts: {
      cyclists: g.cyclists.length,
      scooters: g.scooters.length,
      crabbers: g.crabbers.length,
      boats: g.boats.length,
      gulls: g.gulls.length,
      branchKids: g.branchKids.length,
      ducks: g.ducks.length,
      graffiti: g.graffiti.length,
    },
  };
});

console.log('counts', JSON.stringify(out.counts));
console.log(out.log.length ? out.log.join('\n') : 'nothing appeared or vanished in shot');

await browser.close();
