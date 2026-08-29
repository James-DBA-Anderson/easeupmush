import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Run homepage + all games so /games/<slug>/ works on :5300 like production. */
const kids = [
  spawn("npm run dev -w @easeupmush/site", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  }),
  spawn("npm run dev -w @easeupmush/pompey-punch-up", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      GAME_BASE: "/games/pompey-punch-up/",
      BROWSER: "none",
    },
    shell: true,
  }),
  spawn("npm run dev -w @easeupmush/pompeymon", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      GAME_BASE: "/games/pompeymon/",
      BROWSER: "none",
    },
    shell: true,
  }),
  spawn("npm run dev -w @easeupmush/canoe-lake-cleanup", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      GAME_BASE: "/games/canoe-lake-cleanup/",
      BROWSER: "none",
    },
    shell: true,
  }),
];

function shutDown(code = 0) {
  for (const kid of kids) {
    if (!kid.killed) kid.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutDown(0));
process.on("SIGTERM", () => shutDown(0));
for (const kid of kids) {
  kid.on("exit", (code, signal) => {
    if (signal === "SIGTERM") return;
    shutDown(code ?? 1);
  });
}
