import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
const dest = resolve(app, "public/models/portsmouth-terrain.bin");

function isPointer(path) {
  if (!existsSync(path) || statSync(path).size > 400) return false;
  return readFileSync(path, "utf8").startsWith("version https://git-lfs.github.com/spec/v1");
}

function lfsObject(pointerPath) {
  const text = readFileSync(pointerPath, "utf8");
  const oid = /oid sha256:([0-9a-f]{64})/.exec(text)?.[1];
  if (!oid) return null;
  return resolve(repo, ".git/lfs/objects", oid.slice(0, 2), oid.slice(2, 4), oid);
}

const fallbacks = [
  resolve(repo, "tools/osm-terrain-build/data/portsmouth-terrain.bin"),
];
if (existsSync(dest) && isPointer(dest)) {
  const fromLfs = lfsObject(dest);
  if (fromLfs) fallbacks.unshift(fromLfs);
}

if (!existsSync(dest) || isPointer(dest)) {
  const src = fallbacks.find((p) => existsSync(p) && !isPointer(p) && statSync(p).size > 1_000_000);
  if (!src) {
    console.error("portsmouth-terrain.bin is a Git LFS pointer and the mesh is not on disk. Run git lfs pull.");
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Restored terrain mesh from ${src} (${(statSync(dest).size / 1024 / 1024).toFixed(0)} MB)`);
}
