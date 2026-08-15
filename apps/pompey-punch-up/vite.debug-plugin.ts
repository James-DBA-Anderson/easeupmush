import type { Plugin, ViteDevServer } from "vite";

export type DebugArenaPluginOptions = {
  /** Drop every hot/full-reload update — only Refresh / server.restart applies edits. */
  freeze?: boolean;
};

/**
 * /debug → debug.html, and POST /__debug/restart restarts Vite
 * (used by the arena Refresh button — no auto-reload).
 */
export function debugArenaPlugin(opts: DebugArenaPluginOptions = {}): Plugin {
  const freeze = opts.freeze === true;
  return {
    name: "pompey-debug-arena",
    // Belt-and-suspenders if anything still reaches the HMR pipeline
    handleHotUpdate() {
      if (freeze) return [];
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/debug" || url === "/debug/") {
          req.url = "/debug.html";
        }
        next();
      });

      server.middlewares.use("/__debug/restart", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        // Let the response flush, then bounce the server so the next load is fresh
        setTimeout(() => {
          void server.restart();
        }, 80);
      });
    },
  };
}
