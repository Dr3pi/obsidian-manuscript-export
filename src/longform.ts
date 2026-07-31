/**
 * Parsing helpers for the Longform plugin's index-file frontmatter
 * (github.com/kevboh/longform), kept free of Obsidian imports so the
 * automated test suite can exercise them directly.
 *
 * A Longform project is a note whose frontmatter contains a `longform`
 * object. In `scenes` format the manuscript is an ordered list of scene
 * notes living in `sceneFolder`; in `single` format the index note's own
 * body is the manuscript.
 */

export interface LongformProject {
	format: "scenes" | "single";
	/** Project/draft title from the index file's frontmatter, if present. */
	title: string | null;
	/** Scene note names (no .md extension) in author-defined order, flattened across nesting. */
	scenes: string[];
	/** Raw sceneFolder value from the frontmatter, e.g. "/" or "Scenes". */
	sceneFolder: string;
}

/** Longform stores scene indentation as nested arrays; export order is a depth-first flatten. */
export function flattenScenes(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length > 0) out.push(trimmed);
	} else if (Array.isArray(value)) {
		for (const item of value) flattenScenes(item, out);
	}
	return out;
}

/**
 * Narrows an arbitrary frontmatter `longform` value to a usable project
 * description, or null if it isn't one (wrong shape, unknown format, or a
 * scenes project with no scenes to export).
 */
export function parseLongformFrontmatter(value: unknown): LongformProject | null {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	const format = record.format;
	if (format !== "scenes" && format !== "single") return null;
	const title = typeof record.title === "string" && record.title.trim().length > 0 ? record.title.trim() : null;
	const sceneFolder = typeof record.sceneFolder === "string" ? record.sceneFolder : "/";
	const scenes = format === "scenes" ? flattenScenes(record.scenes) : [];
	if (format === "scenes" && scenes.length === 0) return null;
	return { format, title, scenes, sceneFolder };
}

/**
 * Longform's sceneFolder is relative to the index file's own folder, with
 * "/" meaning that folder itself. Returns a vault-relative folder path with
 * no trailing slash ("" for the vault root).
 */
export function resolveSceneFolderPath(indexParentPath: string, sceneFolder: string): string {
	const parent = indexParentPath === "/" ? "" : indexParentPath.replace(/\/+$/, "");
	const relative = sceneFolder.trim().replace(/^\/+|\/+$/g, "");
	if (relative.length === 0) return parent;
	return parent.length > 0 ? `${parent}/${relative}` : relative;
}

export interface SingleFileChapter {
	/** Heading text, or null for content before the first level-1 heading. */
	title: string | null;
	body: string;
}

/**
 * Splits a single-file manuscript into chapters on its level-1 headings
 * ("# Chapter One"). Content before the first heading becomes an untitled
 * leading chapter only if it isn't just whitespace; a manuscript with no
 * level-1 headings at all comes back as one untitled chapter.
 */
export function splitSingleFileIntoChapters(markdown: string): SingleFileChapter[] {
	const lines = markdown.split(/\r?\n/);
	const chapters: SingleFileChapter[] = [];
	let current: SingleFileChapter = { title: null, body: "" };

	const push = () => {
		if (current.title !== null || current.body.trim().length > 0) chapters.push(current);
	};

	for (const line of lines) {
		const match = /^#\s+(.+?)\s*$/.exec(line);
		if (match) {
			push();
			current = { title: match[1], body: "" };
		} else {
			current.body += current.body.length > 0 ? `\n${line}` : line;
		}
	}
	push();

	return chapters.length > 0 ? chapters : [{ title: null, body: markdown }];
}
