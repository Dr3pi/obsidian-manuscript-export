// Generates a real sample .epub from realistic manuscript-style content, for
// manual inspection. Not part of the automated test suite -- run manually.
import { writeFileSync } from "node:fs";
import { convertNoteToXhtmlBody, buildEpub } from "./.core-bundle.cjs";

const chapter1Markdown = `# The Departure

The old house had stood empty for **eleven years**, and Mira had come back to sell it.

She remembered [[The Garden Gate|the gate]] creaking the same way it always had. Some things, it seemed, refused to change.

***

By the time the sun set, she'd made her decision. She would stay one more night.

> [!note] A reminder to myself
> Ask about the letters in the attic before the estate sale.
`;

const chapter2Markdown = `# The Letters

The attic smelled of *dust and old paper*. Mira found the box exactly where her grandmother's diary said it would be.

Each letter was addressed to someone named "E." -- no last name, no return address.
`;

// Mirrors main.ts's extractLeadingHeading(): the real plugin strips a
// leading "# Title" line before conversion (it becomes the chapter's <h1>
// via ChapterInput.title instead) -- do the same here so this sample is
// representative of actual plugin output, not a doubled-heading artifact.
const stripLeadingHeading = (markdown) => markdown.replace(/^\s*#\s+.+?\r?\n/, "");

const chapters = [
	{ title: "The Departure", xhtmlBody: convertNoteToXhtmlBody(stripLeadingHeading(chapter1Markdown), () => null) },
	{ title: "The Letters", xhtmlBody: convertNoteToXhtmlBody(stripLeadingHeading(chapter2Markdown), () => null) },
];

const arrayBuffer = await buildEpub(chapters, {
	title: "The Last Letter",
	author: "Sample Author",
	language: "en",
	identifier: "urn:uuid:sample-0001",
});

writeFileSync("test/sample-output.epub", Buffer.from(arrayBuffer));
console.log(`Wrote test/sample-output.epub (${arrayBuffer.byteLength} bytes)`);
