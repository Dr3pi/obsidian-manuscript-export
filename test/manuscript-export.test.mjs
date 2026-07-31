// Validates the markdown->XHTML conversion and EPUB packaging with real
// sample manuscript content -- no Obsidian installation required. Run via
// `npm test` (builds the core bundle first, then executes this).
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
	convertNoteToXhtmlBody,
	buildEpub,
	stripFrontmatter,
	flattenScenes,
	parseLongformFrontmatter,
	resolveSceneFolderPath,
	splitSingleFileIntoChapters,
} from "./.core-bundle.cjs";

const noResolver = () => null;

test("stripFrontmatter removes a leading YAML block -- fences must not render as scene breaks", () => {
	const md = "---\ntitle: Chapter One\npov: Mira\n---\nThe rain had stopped.";
	assert.equal(stripFrontmatter(md), "The rain had stopped.");

	const html = convertNoteToXhtmlBody(stripFrontmatter(md), noResolver);
	assert.doesNotMatch(html, /scene-break/);
	assert.doesNotMatch(html, /pov: Mira/);
	assert.match(html, /The rain had stopped\./);
});

test("stripFrontmatter handles an empty frontmatter block and leaves mid-document rules alone", () => {
	assert.equal(stripFrontmatter("---\n---\nBody text."), "Body text.");

	const sceneBreakDoc = "First scene.\n\n---\n\nSecond scene.";
	assert.equal(stripFrontmatter(sceneBreakDoc), sceneBreakDoc);
});

test("flattenScenes flattens Longform's nested scene lists depth-first, in order", () => {
	assert.deepEqual(flattenScenes(["One", ["Two", ["Three"]], "Four"]), ["One", "Two", "Three", "Four"]);
	assert.deepEqual(flattenScenes(undefined), []);
	assert.deepEqual(flattenScenes([42, "  ", "Real Scene"]), ["Real Scene"]);
});

test("parseLongformFrontmatter accepts real scenes/single projects and rejects junk", () => {
	const scenes = parseLongformFrontmatter({
		format: "scenes",
		title: "My Book",
		sceneFolder: "/",
		scenes: ["A", "B"],
		ignoredFiles: [],
	});
	assert.equal(scenes.format, "scenes");
	assert.equal(scenes.title, "My Book");
	assert.deepEqual(scenes.scenes, ["A", "B"]);

	const single = parseLongformFrontmatter({ format: "single", title: "Novella" });
	assert.equal(single.format, "single");
	assert.deepEqual(single.scenes, []);

	assert.equal(parseLongformFrontmatter(null), null);
	assert.equal(parseLongformFrontmatter("longform"), null);
	assert.equal(parseLongformFrontmatter({ format: "banana" }), null);
	assert.equal(parseLongformFrontmatter({ format: "scenes", scenes: [] }), null);
});

test("resolveSceneFolderPath treats '/' as the index file's own folder", () => {
	assert.equal(resolveSceneFolderPath("Books/Novel", "/"), "Books/Novel");
	assert.equal(resolveSceneFolderPath("Books/Novel", "Scenes"), "Books/Novel/Scenes");
	assert.equal(resolveSceneFolderPath("/", "/"), "");
	assert.equal(resolveSceneFolderPath("/", "Scenes"), "Scenes");
});

test("splitSingleFileIntoChapters splits on level-1 headings only", () => {
	const md = "Prologue text.\n\n# Chapter One\n\nFirst. \n\n## Not a chapter\n\n# Chapter Two\n\nSecond.";
	const parts = splitSingleFileIntoChapters(md);

	assert.equal(parts.length, 3);
	assert.equal(parts[0].title, null);
	assert.match(parts[0].body, /Prologue text\./);
	assert.equal(parts[1].title, "Chapter One");
	assert.match(parts[1].body, /## Not a chapter/);
	assert.equal(parts[2].title, "Chapter Two");
	assert.match(parts[2].body, /Second\./);
});

test("splitSingleFileIntoChapters returns one untitled chapter when there are no headings", () => {
	const parts = splitSingleFileIntoChapters("Just one long stream of prose.\n\nAnother paragraph.");
	assert.equal(parts.length, 1);
	assert.equal(parts[0].title, null);
	assert.match(parts[0].body, /Another paragraph\./);
});

test("headings, emphasis, and scene breaks convert correctly", () => {
	const md = [
		"# Chapter One",
		"",
		"She walked into the **old, dusty** library and found *nothing* but silence.",
		"",
		"***",
		"",
		"The next morning was different.",
	].join("\n");

	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.match(html, /<h2>Chapter One<\/h2>/);
	assert.match(html, /<strong>old, dusty<\/strong>/);
	assert.match(html, /<em>nothing<\/em>/);
	assert.match(html, /class="scene-break"/);
	assert.match(html, /The next morning was different\./);
});

test("wikilinks render as plain text, comments are stripped", () => {
	const md = "He remembered [[The Old Bridge|the bridge]] well. %%editor's note: cut this?%% It still stood.";
	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.match(html, /He remembered the bridge well\./);
	assert.doesNotMatch(html, /editor's note/);
	assert.doesNotMatch(html, /\[\[/);
});

test("image embeds resolve to <img> tags via the resolver callback", () => {
	const md = "The map looked like this:\n\n![[village-map.png]]\n\nNothing else mattered.";
	const resolver = (target) =>
		target === "village-map.png" ? { target, dataUri: "data:image/png;base64,AAAA" } : null;

	const html = convertNoteToXhtmlBody(md, resolver);

	assert.match(html, /<img src="data:image\/png;base64,AAAA" alt="village-map\.png" \/>/);
});

test("plain blockquotes (no [!type] marker) render as <blockquote>, for genuine in-story quotes", () => {
	const md = "> Roads go ever ever on.\n> Over rock and under tree.\n\nShe closed the book.";
	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.match(html, /<blockquote>/);
	assert.match(html, /Roads go ever ever on\. Over rock and under tree\./);
	assert.match(html, /She closed the book\./);
});

test("callouts (> [!type] ...) are stripped entirely, not rendered -- they're author notes, not reader content", () => {
	const md = "> [!note] A reminder to myself\n> Don't forget to fix the timeline here.\n\nShe forgot the letter anyway.";
	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.doesNotMatch(html, /<blockquote>/);
	assert.doesNotMatch(html, /reminder to myself/);
	assert.doesNotMatch(html, /fix the timeline/);
	assert.match(html, /She forgot the letter anyway\./);
});

test("a blank line between two ordinary paragraphs still splits them correctly", () => {
	const md = "First paragraph here.\n\nSecond paragraph here.";
	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.equal(html, "<p>First paragraph here.</p>\n<p>Second paragraph here.</p>");
});

test("special characters are escaped, not injected as raw HTML", () => {
	const md = "The sign read: <DANGER> & \"turn back\".";
	const html = convertNoteToXhtmlBody(md, noResolver);

	assert.match(html, /&lt;DANGER&gt;/);
	assert.match(html, /&amp;/);
	assert.doesNotMatch(html, /<DANGER>/);
});

test("buildEpub produces a spec-valid, well-formed EPUB archive", async () => {
	const chapters = [
		{ title: "Chapter One", xhtmlBody: "<p>It was a dark and stormy night.</p>" },
		{ title: "Chapter Two", xhtmlBody: "<p>The next day was worse.</p>" },
	];
	const meta = {
		title: "Test Manuscript",
		author: "A. Writer",
		language: "en",
		identifier: "urn:uuid:test-1234",
	};

	const arrayBuffer = await buildEpub(chapters, meta);
	assert.ok(arrayBuffer instanceof ArrayBuffer);

	const buffer = Buffer.from(arrayBuffer);
	const zip = await JSZip.loadAsync(buffer);

	// mimetype must exist, be uncompressed, and contain exactly the right string.
	const mimetypeFile = zip.file("mimetype");
	assert.ok(mimetypeFile, "mimetype entry must exist");
	assert.equal(await mimetypeFile.async("string"), "application/epub+zip");

	// Required structural files must all be present.
	for (const path of [
		"META-INF/container.xml",
		"OEBPS/content.opf",
		"OEBPS/nav.xhtml",
		"OEBPS/toc.ncx",
		"OEBPS/styles.css",
		"OEBPS/chapter-001.xhtml",
		"OEBPS/chapter-002.xhtml",
	]) {
		assert.ok(zip.file(path), `expected ${path} to exist in the archive`);
	}

	const opf = await zip.file("OEBPS/content.opf").async("string");
	assert.match(opf, /<dc:title>Test Manuscript<\/dc:title>/);
	assert.match(opf, /<dc:creator>A\. Writer<\/dc:creator>/);
	assert.match(opf, /itemref idref="chapter-1"/);
	assert.match(opf, /itemref idref="chapter-2"/);

	const chapterOne = await zip.file("OEBPS/chapter-001.xhtml").async("string");
	assert.match(chapterOne, /<h1>Chapter One<\/h1>/);
	assert.match(chapterOne, /It was a dark and stormy night\./);

	const nav = await zip.file("OEBPS/nav.xhtml").async("string");
	assert.match(nav, /href="chapter-000\.xhtml"|href="chapter-001\.xhtml"/);
});

test("buildEpub rejects an empty chapter list rather than producing a broken file", async () => {
	await assert.rejects(() => buildEpub([], { title: "x", author: "y", language: "en", identifier: "z" }));
});
