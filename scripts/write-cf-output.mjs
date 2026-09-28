import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Materialise `.cloudflare/output/v0` from the assembled `dist/` so `cf deploy
 * --prebuilt` can upload without running workspace autoconfig.
 *
 * `cf deploy` (without --prebuilt) detects frameworks at the npm workspace
 * root and refuses to continue. The deployable app is the assembled static
 * site in `dist/`, not a single workspace package.
 *
 * Worker name / compatibility date must match `cloudflare.config.ts`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const outputRoot = resolve(root, ".cloudflare/output/v0");
const workerDir = resolve(outputRoot, "workers/default");
const assetsDir = resolve(workerDir, "assets");

if (!existsSync(dist)) {
  console.error("Missing dist/ — run npm run build first.");
  process.exit(1);
}

rmSync(resolve(root, ".cloudflare"), { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

writeFileSync(
  resolve(outputRoot, "config.json"),
  JSON.stringify({ buildContext: { isPreview: false } }),
);

writeFileSync(
  resolve(workerDir, "worker.config.json"),
  JSON.stringify({
    name: "easeupmush",
    compatibilityDate: "2026-08-15",
  }),
);

cpSync(dist, assetsDir, { recursive: true });

console.log("Wrote .cloudflare/output/v0 from dist/ for cf deploy --prebuilt");
