/**
 * Converts Obsidian-flavored markdown (as it actually appears in a novelist's
 * manuscript notes -- prose, headings, emphasis, blockquotes, scene breaks,
 * wikilinks, image embeds) into clean, valid XHTML for an EPUB chapter.
 *
 * Deliberately NOT a general-purpose CommonMark parser: manuscript prose
 * doesn't need tables, code blocks, or nested lists, and a hand-rolled
 * subset is easier to keep correct and dependency-free than pulling in a
 * full markdown engine only to strip half its output back out again.
 */

export interface ResolvedEmbed {
	/** The raw text inside ![[ ]], before any |alias. */
	target: string;
	/** Base64 data URI, if this embed resolved to an image the caller found in the vault. */
	dataUri: string | null;
}

export type EmbedResolver = (target: string) => ResolvedEmbed | null;

function escapeXhtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Strips %%comments%% -- never meant to reach a reader. */
function stripComments(source: string): string {
	return source.replace(/%%[\s\S]*?%%/g, "");
}

/**
 * Placeholders wrap a resolved-HTML index in Unicode Private Use Area
 * characters (U+E000/U+E001), which never appear in real manuscript prose
 * -- unlike plain digits, which do ("In 1922, she..."). This lets a
 * placeholder pass through escapeXhtml/applyInlineEmphasis completely
 * untouched, then get swapped back for real HTML (an <img> tag) as the
 * very last step, so pre-resolved HTML never gets double-escaped along
 * with the surrounding prose.
 */
const PLACEHOLDER_OPEN = "";
const PLACEHOLDER_CLOSE = "";
const PLACEHOLDER_RE = new RegExp(`${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`, "g");

function makePlaceholder(index: number): string {
	return `${PLACEHOLDER_OPEN}${index}${PLACEHOLDER_CLOSE}`;
}

function restorePlaceholders(html: string, rawHtmlByPlaceholder: string[]): string {
	return html.replace(PLACEHOLDER_RE, (_match, indexStr: string) => rawHtmlByPlaceholder[Number(indexStr)] ?? "");
}

/**
 * Resolves [[Note]], [[Note|Alias]], and ![[Embed]] before line-level
 * parsing, since they can appear mid-sentence and shouldn't be confused
 * with emphasis markers. Any raw HTML produced (image tags) is pushed onto
 * `rawHtmlByPlaceholder` and replaced with a placeholder token so it
 * survives later escaping untouched -- see restorePlaceholders().
 */
function resolveLinksAndEmbeds(line: string, resolveEmbed: EmbedResolver, rawHtmlByPlaceholder: string[]): string {
	// Image/note embeds: ![[target]] or ![[target|alias]]
	line = line.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
		const resolved = resolveEmbed(target.trim());
		if (resolved?.dataUri) {
			const altText = alias ?? target.trim();
			const html = `<img src="${resolved.dataUri}" alt="${escapeXhtml(altText)}" />`;
			const index = rawHtmlByPlaceholder.push(html) - 1;
			return makePlaceholder(index);
		}
		// Non-image embeds (transcluded notes) are a v1 limitation -- skip
		// silently rather than leaking Obsidian syntax into the reader's book.
		return "";
	});

	// Plain wikilinks: [[Note]] or [[Note|Display text]] -- rendered as
	// plain text, since the target note's filename means nothing to a
	// reader of the finished book.
	line = line.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
		return alias ?? target;
	});

	return line;
}

/** Applies **bold**, *italic*, and matching underscore variants, inline. */
function applyInlineEmphasis(escapedLine: string): string {
	return escapedLine
		.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
		.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>")
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/__(.+?)__/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(/(?<![A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])/g, "<em>$1</em>");
}

const SCENE_BREAK_RE = /^\s*(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const CALLOUT_START_RE = /^>\s*\[!\w+\][+-]?\s*(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

/**
 * Converts one manuscript note's raw markdown into an XHTML body fragment
 * (no <html>/<head> wrapper -- the caller inserts this into a chapter
 * template). `title` becomes the chapter's <h1>.
 */
type QuoteMode = "none" | "blockquote" | "callout";

export function convertNoteToXhtmlBody(rawMarkdown: string, resolveEmbed: EmbedResolver): string {
	const withoutComments = stripComments(rawMarkdown);
	const lines = withoutComments.split(/\r?\n/);
	const rawHtmlByPlaceholder: string[] = [];

	const htmlParts: string[] = [];
	let paragraphBuffer: string[] = [];
	let quoteMode: QuoteMode = "none";

	const flushParagraph = () => {
		if (paragraphBuffer.length === 0) return;
		const joined = paragraphBuffer.join(" ").trim();
		if (joined.length > 0) {
			const rendered = applyInlineEmphasis(escapeXhtml(joined));
			htmlParts.push(`<p>${restorePlaceholders(rendered, rawHtmlByPlaceholder)}</p>`);
		}
		paragraphBuffer = [];
	};

	// Resolves whatever's currently buffered at a block boundary (a blank
	// line, a scene break, a heading, or prose resuming after a quote) and
	// resets quote state. Callouts (> [!note] ...) are almost always
	// private author annotations in Obsidian -- reminders, continuity
	// notes, research todos -- not content meant for a reader, so their
	// buffered text is discarded here rather than flushed. A plain >
	// blockquote (no [!type] marker) is the tool a writer reaches for when
	// they DO want an in-story quote (an epigraph, a quoted letter), so
	// that path still flushes and closes normally. Ordinary prose (mode
	// "none") just flushes its paragraph like any other boundary.
	const resolveBoundary = () => {
		if (quoteMode === "callout") {
			paragraphBuffer = []; // discard -- never meant for the reader
		} else if (quoteMode === "blockquote") {
			flushParagraph();
			htmlParts.push("</blockquote>");
		} else {
			flushParagraph();
		}
		quoteMode = "none";
	};

	for (const rawLine of lines) {
		const line = resolveLinksAndEmbeds(rawLine, resolveEmbed, rawHtmlByPlaceholder);

		if (line.trim() === "") {
			resolveBoundary();
			continue;
		}

		if (SCENE_BREAK_RE.test(line)) {
			resolveBoundary();
			htmlParts.push('<p class="scene-break">&#8226;&#8226;&#8226;</p>');
			continue;
		}

		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			resolveBoundary();
			const level = Math.min(headingMatch[1].length + 1, 6); // chapter <h1> stays the top level
			const text = restorePlaceholders(applyInlineEmphasis(escapeXhtml(headingMatch[2].trim())), rawHtmlByPlaceholder);
			htmlParts.push(`<h${level}>${text}</h${level}>`);
			continue;
		}

		const calloutMatch = CALLOUT_START_RE.exec(line);
		if (calloutMatch) {
			resolveBoundary();
			quoteMode = "callout"; // content discarded when this closes -- see resolveBoundary
			continue;
		}

		const quoteMatch = BLOCKQUOTE_RE.exec(line);
		if (quoteMatch && (quoteMode !== "none" || line.startsWith(">"))) {
			if (quoteMode === "none") {
				htmlParts.push("<blockquote>");
				quoteMode = "blockquote";
			}
			if (quoteMode === "blockquote") {
				paragraphBuffer.push(quoteMatch[1]);
			}
			// quoteMode === "callout": continuation line of a discarded callout, ignored.
			continue;
		}

		// Plain prose line -- closes any open quote/callout first.
		if (quoteMode !== "none") {
			resolveBoundary();
		}
		paragraphBuffer.push(line.trim());
	}

	resolveBoundary();

	return htmlParts.join("\n");
}
