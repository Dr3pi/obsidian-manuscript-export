// End-to-end tests of the REAL plugin class (src/main.ts) against an
// in-memory vault -- the closest thing to running inside Obsidian that CI
// can do. Covers the full v0.2.0 command flows: Longform scenes projects,
// single-file projects, folder mode, and the frontmatter-stripping fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { ManuscriptExportPlugin, App, notices, resetNotices } from "./.harness-bundle.cjs";

/** Adds a note to the fake vault and mirrors Obsidian's metadata cache for it. */
function addNote(app, path, content, { frontmatter, coldCache = false } = {}) {
	const file = app.vault.addFile(path, content);
	const entry = {};
	if (frontmatter) entry.frontmatter = frontmatter;
	const fenceMatch = /^---\r?\n[\s\S]*?\r?\n---/.exec(content);
	// coldCache simulates the metadata cache not having parsed frontmatter
	// position yet, forcing the regex-fallback strip path.
	if (fenceMatch && !coldCache) entry.frontmatterPosition = { end: { offset: fenceMatch[0].length } };
	app.metadataCache.setCache(path, entry);
	return file;
}

async function loadedPlugin(app) {
	const plugin = new ManuscriptExportPlugin(app, { id: "manuscript-export" });
	await plugin.onload();
	return plugin;
}

async function readEpub(app, path) {
	const binary = app.vault.binaryAt(path);
	assert.ok(binary, `expected an EPUB at "${path}"`);
	return JSZip.loadAsync(Buffer.from(binary));
}

async function chapterTitlesInSpineOrder(zip) {
	const nav = await zip.file("OEBPS/nav.xhtml").async("string");
	return Array.from(nav.matchAll(/<li><a href="[^"]+">([^<]+)<\/a><\/li>/g)).map((m) => m[1]);
}

test("Longform scenes project exports in author order, skipping missing scenes with a warning", async () => {
	resetNotices();
	const app = new App();

	addNote(app, "Novel/Index.md", "---\nlongform: ...\n---\n", {
		frontmatter: {
			longform: {
				format: "scenes",
				title: "The Hollow Crown",
				sceneFolder: "Scenes",
				scenes: ["Arrival", ["The Feast"], "Missing Scene", "Departure"],
				ignoredFiles: [],
			},
		},
	});
	// Warm cache: frontmatterPosition available, cache-based strip path.
	addNote(app, "Novel/Scenes/Arrival.md", "---\npov: Mira\n---\n# Arrival\n\nThe gates stood open.", {
		frontmatter: { pov: "Mira" },
	});
	// No frontmatter, title falls back to the basename.
	addNote(app, "Novel/Scenes/The Feast.md", "Wine flowed freely.");
	// Cold cache: frontmatter known but no position parsed yet -- regex fallback.
	addNote(app, "Novel/Scenes/Departure.md", "---\ntitle: Departure at Dawn\n---\nShe left before sunrise.", {
		frontmatter: { title: "Departure at Dawn" },
		coldCache: true,
	});

	const plugin = await loadedPlugin(app);
	// A stale vault-wide title from an earlier manuscript must NOT override
	// the Longform project's own title (real failure caught in manual testing).
	plugin.settings.bookTitle = "The Last Letter";
	await plugin.exportLongformProject();

	const zip = await readEpub(app, "The Hollow Crown.epub");
	const opf = await zip.file("OEBPS/content.opf").async("string");
	assert.match(opf, /<dc:title>The Hollow Crown<\/dc:title>/);
	assert.deepEqual(await chapterTitlesInSpineOrder(zip), ["Arrival", "The Feast", "Departure at Dawn"]);

	const chapterOne = await zip.file("OEBPS/chapter-001.xhtml").async("string");
	assert.match(chapterOne, /The gates stood open\./);
	assert.doesNotMatch(chapterOne, /pov: Mira/);
	assert.doesNotMatch(chapterOne, /scene-break/);

	const chapterThree = await zip.file("OEBPS/chapter-003.xhtml").async("string");
	assert.match(chapterThree, /She left before sunrise\./);
	assert.doesNotMatch(chapterThree, /title: Departure/);

	assert.ok(
		notices.some((n) => n.includes("skipped 1 missing scene") && n.includes("Missing Scene")),
		`expected a missing-scene warning, got: ${JSON.stringify(notices)}`
	);
});

test("single-file Longform project splits into chapters on level-1 headings", async () => {
	resetNotices();
	const app = new App();

	addNote(app, "Small Hours.md", "---\nlongform: ...\n---\nThe city hummed below.\n\n# One\n\nAlpha.\n\n# Two\n\nBeta.", {
		frontmatter: { longform: { format: "single", title: "Small Hours" } },
	});

	const plugin = await loadedPlugin(app);
	await plugin.exportLongformProject();

	const zip = await readEpub(app, "Small Hours.epub");
	// The untitled leading section takes the book title as its chapter title.
	assert.deepEqual(await chapterTitlesInSpineOrder(zip), ["Small Hours", "One", "Two"]);

	const chapterTwo = await zip.file("OEBPS/chapter-002.xhtml").async("string");
	assert.match(chapterTwo, /Alpha\./);
	assert.doesNotMatch(chapterTwo, /The city hummed below\./);
});

test("folder mode still works, in natural-sort order, with frontmatter stripped (v0.1.x bug)", async () => {
	resetNotices();
	const app = new App();

	addNote(app, "Chapters/2 The Key.md", "It turned with a click.");
	addNote(app, "Chapters/10 The Gate.md", "Beyond it, nothing.");
	addNote(app, "Chapters/1 The Door.md", "---\ndraft: 3\nstatus: done\n---\nIt was locked.", {
		frontmatter: { draft: 3, status: "done" },
	});

	const plugin = await loadedPlugin(app);
	plugin.settings.manuscriptFolder = "Chapters";
	plugin.settings.bookTitle = "Doors";
	await plugin.exportToEpub();

	const zip = await readEpub(app, "Doors.epub");
	assert.deepEqual(await chapterTitlesInSpineOrder(zip), ["1 The Door", "2 The Key", "10 The Gate"]);

	const chapterOne = await zip.file("OEBPS/chapter-001.xhtml").async("string");
	assert.match(chapterOne, /It was locked\./);
	assert.doesNotMatch(chapterOne, /status: done/);
	assert.doesNotMatch(chapterOne, /scene-break/);
});

test("multiple Longform projects go through the picker (stub picks the first)", async () => {
	resetNotices();
	const app = new App();

	addNote(app, "First.md", "---\nlongform: ...\n---\nOnly line of the first book.", {
		frontmatter: { longform: { format: "single", title: "First Book" } },
	});
	addNote(app, "Second.md", "---\nlongform: ...\n---\nOnly line of the second book.", {
		frontmatter: { longform: { format: "single", title: "Second Book" } },
	});

	const plugin = await loadedPlugin(app);
	await plugin.exportLongformProject();
	// The modal is fire-and-forget; the stub chooses synchronously but the
	// export it kicks off is async -- give it a tick to finish.
	await new Promise((resolve) => setTimeout(resolve, 50));

	assert.ok(app.vault.binaryAt("First Book.epub"), "expected the first project to be exported");
	assert.equal(app.vault.binaryAt("Second Book.epub"), null);
});

test("no Longform projects in the vault points the user at folder mode instead", async () => {
	resetNotices();
	const app = new App();
	addNote(app, "Just a note.md", "Nothing longform about this.");

	const plugin = await loadedPlugin(app);
	await plugin.exportLongformProject();

	assert.ok(notices.some((n) => n.includes("no Longform projects")));
	assert.equal(app.vault.binaryAt("Untitled Manuscript.epub"), null);
});
