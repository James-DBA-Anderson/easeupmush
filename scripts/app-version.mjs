import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Public game version: 0.1.{commit count}, or GAME_VERSION if set. */
export function resolveAppVersion() {
  const override = process.env.GAME_VERSION?.trim();
  if (override) return override;

  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const [maj, min] = String(pkg.version || "0.1.0").split(".");
  try {
    const count = execSync("git rev-list --count HEAD", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^\d+$/.test(count)) return `${maj}.${min}.${count}`;
  } catch {
    // No git (zip download, shallow fail) — fall back to package.json
  }
  return String(pkg.version || "0.1.0");
}

/** Stamp %APP_VERSION% into HTML and expose __APP_VERSION__ to modules. */
export function appVersionPlugin() {
  const version = resolveAppVersion();
  return {
    name: "app-version",
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
        },
      };
    },
    transformIndexHtml(html) {
      return html.replaceAll("%APP_VERSION%", version);
    },
  };
}
