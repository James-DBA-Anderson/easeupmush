import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "easeupmush",
		compatibilityDate: "2026-08-15",
		entrypoint: "./worker.ts",
		assets: {
			// Terrain mesh is too big for Worker static assets (25 MiB/file).
			// Serve it from R2; everything else stays on the static dist/ site.
			runWorkerFirst: ["/api/*", "/games/simpompey/models/portsmouth-terrain.bin"],
		},
		env: {
			SCORES: bindings.kv(),
			MAPS: bindings.r2({ name: "easeupmush-maps" }),
			AI: bindings.ai(),
		},
	},
});
