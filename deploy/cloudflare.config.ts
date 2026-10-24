import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "easeupmush",
		compatibilityDate: "2026-08-15",
		entrypoint: "./worker.ts",
		assets: {
			runWorkerFirst: ["/api/*"],
		},
		env: {
			SCORES: bindings.kv(),
			AI: bindings.ai(),
		},
	},
});
