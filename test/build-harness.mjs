// Bundles the REAL plugin class (src/main.ts) with the in-memory obsidian
// stub swapped in for the `obsidian` package, producing a CJS module the
// integration test can drive outside a running vault. Complements
// build-testable-core.mjs, which covers only the Obsidian-independent core.
import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const stubPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "obsidian-stub.ts");

await esbuild.build({
	entryPoints: ["test/harness-entry.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2018",
	outfile: "test/.harness-bundle.cjs",
	plugins: [
		{
			name: "obsidian-stub",
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({ path: stubPath }));
			},
		},
	],
});
