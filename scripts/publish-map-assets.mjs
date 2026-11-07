import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = resolve(root, "apps/simpompey/public/models/portsmouth-terrain.bin");
const distGltf = resolve(root, "dist/games/simpompey/models/portsmouth-terrain.gltf");
const distBin = resolve(root, "dist/games/simpompey/models/portsmouth-terrain.bin");
const deployDir = resolve(root, "deploy");
const wranglerBin = resolve(deployDir, "node_modules/.bin/wrangler");
const tmpDir = resolve(root, ".local/r2-parts");

const BUCKET = "easeupmush-maps";
const PREFIX = "simpompey/portsmouth-terrain";
const MIN_BIN_BYTES = 1_000_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function wrangler(args, { allowFail = false, quiet = false } = {}) {
  if (!existsSync(wranglerBin)) {
    fail("Missing deploy/node_modules/.bin/wrangler — run npm ci --prefix deploy first.");
  }
  const result = spawnSync(wranglerBin, args, {
    cwd: deployDir,
    env: process.env,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFail) {
    if (quiet) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(`wrangler ${args.join(" ")} failed.`);
  }
  return result;
}

async function sha256File(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

function readRemoteManifest() {
  mkdirSync(tmpDir, { recursive: true });
  const dest = resolve(tmpDir, "remote.json");
  rmSync(dest, { force: true });
  const result = wrangler(
    ["r2", "object", "get", `${BUCKET}/${PREFIX}.json`, "--remote", "--file", dest],
    { allowFail: true, quiet: true },
  );
  if (result.status !== 0 || !existsSync(dest)) return null;
  try {
    return JSON.parse(readFileSync(dest, "utf8"));
  } catch {
    return null;
  }
}

function putFile(key, file, contentType) {
  wrangler([
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--file",
    file,
    "--remote",
    "--content-type",
    contentType,
    "--cache-control",
    "public, max-age=31536000, immutable",
  ]);
}

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  fail("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to publish the map mesh.");
}

if (!existsSync(binPath)) {
  fail(`Missing ${binPath}`);
}

const header = Buffer.alloc(80);
const peek = openSync(binPath, "r");
readSync(peek, header, 0, header.length, 0);
closeSync(peek);
if (header.toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1")) {
  fail("portsmouth-terrain.bin is still a Git LFS pointer — fetch LFS before deploy.");
}

const { size: binSize } = statSync(binPath);
if (binSize < MIN_BIN_BYTES) {
  fail(`portsmouth-terrain.bin is ${binSize} bytes — Git LFS did not fetch the mesh.`);
}

const hash = await sha256File(binPath);
const manifest = { hash, size: binSize };

console.log(`Map mesh ${binSize} bytes, sha256 ${hash}.`);

wrangler(["r2", "bucket", "create", BUCKET], { allowFail: true, quiet: true });

const remote = readRemoteManifest();
if (remote?.hash === hash && remote.size === binSize) {
  console.log("R2 already has this mesh, skipping upload.");
} else {
  mkdirSync(tmpDir, { recursive: true });
  console.log("Uploading portsmouth-terrain.bin to R2 (this takes a few minutes).");
  putFile(`${PREFIX}.bin`, binPath, "application/octet-stream");
  const manifestPath = resolve(tmpDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  putFile(`${PREFIX}.json`, manifestPath, "application/json");
  console.log("Uploaded map mesh to R2.");
}

if (existsSync(distGltf)) {
  const gltf = JSON.parse(readFileSync(distGltf, "utf8"));
  if (gltf.buffers?.[0]) {
    gltf.buffers[0].uri = `portsmouth-terrain.bin?v=${hash.slice(0, 12)}`;
    writeFileSync(distGltf, JSON.stringify(gltf));
  }
}

if (existsSync(distBin)) {
  rmSync(distBin);
  console.log("Removed terrain.bin from dist/ so Cloudflare Worker assets stay under 25 MiB.");
}
