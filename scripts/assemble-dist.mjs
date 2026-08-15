import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const siteDist = resolve(root, "apps/site/dist");
const gameDist = resolve(root, "apps/pompey-punch-up/dist");

if (!existsSync(siteDist)) {
  console.error("Missing apps/site/dist — run site build first.");
  process.exit(1);
}
if (!existsSync(gameDist)) {
  console.error("Missing apps/pompey-punch-up/dist — run game build first.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(siteDist, dist, { recursive: true });

const gameOut = resolve(dist, "games/pompey-punch-up");
mkdirSync(gameOut, { recursive: true });
cpSync(gameDist, gameOut, { recursive: true });

writeFileSync(resolve(dist, "CNAME"), "easeupmush.com\n");

console.log("Assembled dist/ (site + games/pompey-punch-up)");
