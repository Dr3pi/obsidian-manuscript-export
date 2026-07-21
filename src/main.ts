import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, ManuscriptExportSettings, ManuscriptExportSettingTab } from "./settings";
import { convertNoteToXhtmlBody, ResolvedEmbed } from "./markdownToXhtml";
import { buildEpub, ChapterInput } from "./epubBuilder";

/** "Chapter 2" must sort before "Chapter 10" -- a plain string compare gets this wrong. */
function naturalCompare(a: string, b: string): number {
	const chunk = (s: string) => s.match(/\d+|\D+/g) ?? [];
	const chunksA = chunk(a);
	const chunksB = chunk(b);
	const len = Math.max(chunksA.length, chunksB.length);
	for (let i = 0; i < len; i++) {
		const partA = chunksA[i] ?? "";
		const partB = chunksB[i] ?? "";
		const numA = Number(partA);
		const numB = Number(partB);
		if (!Number.isNaN(numA) && !Number.isNaN(numB) && partA !== "" && partB !== "") {
			if (numA !== numB) return numA - numB;
		} else if (partA !== partB) {
			return partA < partB ? -1 : 1;
		}
	}
	return 0;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
};

/** Strips a leading "# Title" line from a note's body, if present, and returns both. */
function extractLeadingHeading(markdown: string): { title: string | null; rest: string } {
	const match = /^\s*#\s+(.+?)\s*\r?\n/.exec(markdown);
	if (!match) return { title: null, rest: markdown };
	return { title: match[1], rest: markdown.slice(match[0].length) };
}

export default class ManuscriptExportPlugin extends Plugin {
	settings: ManuscriptExportSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "export-manuscript-to-epub",
			name: "Export manuscript to EPUB",
			callback: () => this.exportToEpub(),
		});

		this.addSettingTab(new ManuscriptExportSettingTab(this.app, this));
	}

	async loadSettings() {
		// loadData() returns arbitrary persisted JSON typed `any` by the
		// Obsidian API. An `as` cast straight to ManuscriptExportSettings
		// doesn't actually validate anything at runtime -- it's still
		// flagged as unsafe, correctly, since corrupted or old-format data
		// would silently masquerade as well-typed. Check each field for
		// real, falling back to the default for anything that isn't
		// actually a string (missing, wrong type, or corrupted data.json).
		const loaded: unknown = await this.loadData();
		const record: Record<string, unknown> =
			typeof loaded === "object" && loaded !== null ? (loaded as Record<string, unknown>) : {};

		const stringOrDefault = (value: unknown, fallback: string): string =>
			typeof value === "string" ? value : fallback;

		this.settings = {
			bookTitle: stringOrDefault(record.bookTitle, DEFAULT_SETTINGS.bookTitle),
			authorName: stringOrDefault(record.authorName, DEFAULT_SETTINGS.authorName),
			language: stringOrDefault(record.language, DEFAULT_SETTINGS.language),
			manuscriptFolder: stringOrDefault(record.manuscriptFolder, DEFAULT_SETTINGS.manuscriptFolder),
			outputFolder: stringOrDefault(record.outputFolder, DEFAULT_SETTINGS.outputFolder),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async resolveEmbed(target: string, sourcePath: string): Promise<ResolvedEmbed> {
		const dest = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
		if (!(dest instanceof TFile)) {
			return { target, dataUri: null };
		}
		const ext = dest.extension.toLowerCase();
		const mime = IMAGE_MIME_BY_EXT[ext];
		if (!mime) {
			return { target, dataUri: null }; // not an image -- v1 doesn't transclude other notes
		}
		const binary = await this.app.vault.readBinary(dest);
		return { target, dataUri: `data:${mime};base64,${arrayBufferToBase64(binary)}` };
	}

	private deriveChapterTitle(file: TFile, frontmatterTitle: string | undefined, headingTitle: string | null): string {
		return frontmatterTitle?.trim() || headingTitle?.trim() || file.basename;
	}

	async exportToEpub(): Promise<void> {
		const { manuscriptFolder, bookTitle, authorName, language, outputFolder } = this.settings;

		if (!manuscriptFolder) {
			new Notice("Manuscript Export: set a manuscript folder in the plugin settings first.");
			return;
		}

		const folder = this.app.vault.getAbstractFileByPath(normalizePath(manuscriptFolder));
		if (!(folder instanceof TFolder)) {
			new Notice(`Manuscript Export: "${manuscriptFolder}" is not a folder in this vault.`);
			return;
		}

		const noteFiles = folder.children
			.filter((f): f is TFile => f instanceof TFile && f.extension === "md")
			.sort((a, b) => naturalCompare(a.name, b.name));

		if (noteFiles.length === 0) {
			new Notice(`Manuscript Export: no markdown notes found in "${manuscriptFolder}".`);
			return;
		}

		new Notice(`Manuscript Export: converting ${noteFiles.length} chapter(s)...`);

		const chapters: ChapterInput[] = [];
		for (const file of noteFiles) {
			const raw = await this.app.vault.read(file);
			// frontmatter is typed `any` by the Obsidian API -- narrow with
			// a real runtime check rather than an unchecked cast, so a
			// non-string title field (e.g. a number or array, however
			// unlikely) can't silently masquerade as a string.
			const rawFrontmatterTitle = this.app.metadataCache.getFileCache(file)?.frontmatter?.title;
			const frontmatterTitle = typeof rawFrontmatterTitle === "string" ? rawFrontmatterTitle : undefined;
			const { title: headingTitle, rest } = extractLeadingHeading(raw);
			const title = this.deriveChapterTitle(file, frontmatterTitle, headingTitle);

			// Embed resolution is async (reads binary files); resolve every
			// embed in this note up front so the synchronous markdown
			// converter can look results up by target string.
			const embedTargets = Array.from(rest.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)).map((m) => m[1].trim());
			const resolved = new Map<string, ResolvedEmbed>();
			for (const target of new Set(embedTargets)) {
				resolved.set(target, await this.resolveEmbed(target, file.path));
			}

			const xhtmlBody = convertNoteToXhtmlBody(rest, (target) => resolved.get(target) ?? { target, dataUri: null });
			chapters.push({ title, xhtmlBody });
		}

		const arrayBuffer = await buildEpub(chapters, {
			title: bookTitle || "Untitled Manuscript",
			author: authorName || "Unknown",
			language: language || "en",
			identifier: `urn:uuid:${crypto.randomUUID()}`,
		});

		const outFolderPath = normalizePath(outputFolder || "/");
		if (outputFolder && !(this.app.vault.getAbstractFileByPath(outFolderPath) instanceof TFolder)) {
			await this.app.vault.createFolder(outFolderPath).catch(() => undefined);
		}

		const safeTitle = (bookTitle || "manuscript").replace(/[\\/:*?"<>|]/g, "_");
		const outPath = normalizePath(`${outputFolder ? outputFolder + "/" : ""}${safeTitle}.epub`);

		const existing = this.app.vault.getAbstractFileByPath(outPath);
		if (existing instanceof TFile) {
			await this.app.vault.modifyBinary(existing, arrayBuffer);
		} else {
			await this.app.vault.createBinary(outPath, arrayBuffer);
		}

		new Notice(`Manuscript Export: wrote ${outPath} (${chapters.length} chapters).`);
	}
}
