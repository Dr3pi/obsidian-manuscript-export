// Bundles just the Obsidian-independent modules (markdown conversion + EPUB
// packaging) into a CJS module the test script can require -- main.ts pulls
// in the `obsidian` package, which only exists inside a running vault, so it
// can't be exercised outside Obsidian and is deliberately excluded here.
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["test/core-entry.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2018",
	outfile: "test/.core-bundle.cjs",
});
