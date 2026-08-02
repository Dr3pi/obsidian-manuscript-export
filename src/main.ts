import { App, FuzzySuggestModal, Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, ManuscriptExportSettings, ManuscriptExportSettingTab } from "./settings";
import { convertNoteToXhtmlBody, stripFrontmatter, ResolvedEmbed } from "./markdownToXhtml";
import { buildEpub, ChapterInput } from "./epubBuilder";
import {
	LongformProject,
	parseLongformFrontmatter,
	resolveSceneFolderPath,
	splitSingleFileIntoChapters,
} from "./longform";

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

/** A Longform index file found in the vault, paired with its parsed project frontmatter. */
interface LongformIndexEntry {
	indexFile: TFile;
	project: LongformProject;
}

function longformDisplayName(entry: LongformIndexEntry): string {
	return entry.project.title ?? entry.indexFile.basename;
}

class LongformProjectModal extends FuzzySuggestModal<LongformIndexEntry> {
	private entries: LongformIndexEntry[];
	private onChoose: (entry: LongformIndexEntry) => void;

	constructor(app: App, entries: LongformIndexEntry[], onChoose: (entry: LongformIndexEntry) => void) {
		super(app);
		this.entries = entries;
		this.onChoose = onChoose;
		this.setPlaceholder("Choose a Longform project to export");
	}

	getItems(): LongformIndexEntry[] {
		return this.entries;
	}

	getItemText(entry: LongformIndexEntry): string {
		return longformDisplayName(entry);
	}

	onChooseItem(entry: LongformIndexEntry): void {
		this.onChoose(entry);
	}
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

		this.addCommand({
			id: "export-longform-to-epub",
			name: "Export Longform project to EPUB",
			callback: () => this.exportLongformProject(),
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

	/**
	 * Reads a note's body with its YAML frontmatter removed. Prefers
	 * Obsidian's own frontmatter parse (metadata cache) and falls back to
	 * the regex-based strip only when the cache hasn't caught up yet.
	 */
	private async readNoteBody(file: TFile): Promise<string> {
		const raw = await this.app.vault.read(file);
		const fmEnd = this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end?.offset;
		if (typeof fmEnd === "number" && fmEnd > 0) {
			return raw.slice(fmEnd).replace(/^\r?\n/, "");
		}
		return stripFrontmatter(raw);
	}

	/** Converts already-loaded markdown into one EPUB chapter, resolving its image embeds. */
	private async buildChapterFromMarkdown(title: string, markdown: string, sourcePath: string): Promise<ChapterInput> {
		// Embed resolution is async (reads binary files); resolve every
		// embed up front so the synchronous markdown converter can look
		// results up by target string.
		const embedTargets = Array.from(markdown.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)).map((m) => m[1].trim());
		const resolved = new Map<string, ResolvedEmbed>();
		for (const target of new Set(embedTargets)) {
			resolved.set(target, await this.resolveEmbed(target, sourcePath));
		}
		const xhtmlBody = convertNoteToXhtmlBody(markdown, (target) => resolved.get(target) ?? { target, dataUri: null });
		return { title, xhtmlBody };
	}

	/** Converts one whole note into one EPUB chapter, titling it from frontmatter/heading/filename. */
	private async noteToChapter(file: TFile): Promise<ChapterInput> {
		const body = await this.readNoteBody(file);
		// frontmatter is typed `any` by the Obsidian API -- narrow with
		// a real runtime check rather than an unchecked cast, so a
		// non-string title field (e.g. a number or array, however
		// unlikely) can't silently masquerade as a string.
		const rawFrontmatterTitle: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.title;
		const frontmatterTitle = typeof rawFrontmatterTitle === "string" ? rawFrontmatterTitle : undefined;
		const { title: headingTitle, rest } = extractLeadingHeading(body);
		const title = this.deriveChapterTitle(file, frontmatterTitle, headingTitle);
		return this.buildChapterFromMarkdown(title, rest, file.path);
	}

	/** Packages finished chapters into an .epub and writes it into the configured output folder. */
	private async writeEpub(chapters: ChapterInput[], bookTitle: string): Promise<void> {
		const { authorName, language, outputFolder } = this.settings;

		const arrayBuffer = await buildEpub(chapters, {
			title: bookTitle,
			author: authorName || "Unknown",
			language: language || "en",
			identifier: `urn:uuid:${crypto.randomUUID()}`,
		});

		const outFolderPath = normalizePath(outputFolder || "/");
		if (outputFolder && !(this.app.vault.getAbstractFileByPath(outFolderPath) instanceof TFolder)) {
			await this.app.vault.createFolder(outFolderPath).catch(() => undefined);
		}

		const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, "_");
		const outPath = normalizePath(`${outputFolder ? outputFolder + "/" : ""}${safeTitle}.epub`);

		const existing = this.app.vault.getAbstractFileByPath(outPath);
		if (existing instanceof TFile) {
			await this.app.vault.modifyBinary(existing, arrayBuffer);
		} else {
			await this.app.vault.createBinary(outPath, arrayBuffer);
		}

		new Notice(`Manuscript Export: wrote ${outPath} (${chapters.length} chapter${chapters.length === 1 ? "" : "s"}).`);
	}

	async exportToEpub(): Promise<void> {
		const { manuscriptFolder, bookTitle } = this.settings;

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
			chapters.push(await this.noteToChapter(file));
		}

		await this.writeEpub(chapters, bookTitle || "Untitled Manuscript");
	}

	/** Finds every Longform index file in the vault via the metadata cache. */
	private findLongformProjects(): LongformIndexEntry[] {
		const entries: LongformIndexEntry[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const rawLongform: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.longform;
			const project = parseLongformFrontmatter(rawLongform);
			if (project) entries.push({ indexFile: file, project });
		}
		return entries;
	}

	async exportLongformProject(): Promise<void> {
		const entries = this.findLongformProjects();

		if (entries.length === 0) {
			new Notice(
				'Manuscript Export: no Longform projects found in this vault. For a plain folder of chapter notes, use "Export manuscript to EPUB" instead.'
			);
			return;
		}

		if (entries.length === 1) {
			await this.exportLongformEntry(entries[0]);
			return;
		}

		new LongformProjectModal(this.app, entries, (entry) => {
			void this.exportLongformEntry(entry);
		}).open();
	}

	private async exportLongformEntry(entry: LongformIndexEntry): Promise<void> {
		const { indexFile, project } = entry;
		// The Longform project's own title is the author's intent for THIS
		// book; the settings title is vault-wide and may belong to a
		// different manuscript entirely (a real failure caught in manual
		// testing), so the project title wins.
		const bookTitle = project.title || this.settings.bookTitle || "Untitled Manuscript";

		const chapters: ChapterInput[] = [];
		const missingScenes: string[] = [];

		if (project.format === "single") {
			const body = await this.readNoteBody(indexFile);
			if (body.trim().length === 0) {
				new Notice(`Manuscript Export: "${longformDisplayName(entry)}" has no content to export.`);
				return;
			}
			const parts = splitSingleFileIntoChapters(body);
			new Notice(`Manuscript Export: converting ${parts.length} chapter(s)...`);
			for (const part of parts) {
				chapters.push(await this.buildChapterFromMarkdown(part.title ?? bookTitle, part.body, indexFile.path));
			}
		} else {
			const sceneFolder = resolveSceneFolderPath(indexFile.parent?.path ?? "/", project.sceneFolder);
			new Notice(`Manuscript Export: converting ${project.scenes.length} scene(s)...`);
			for (const sceneName of project.scenes) {
				const scenePath = normalizePath(sceneFolder ? `${sceneFolder}/${sceneName}.md` : `${sceneName}.md`);
				const sceneFile = this.app.vault.getAbstractFileByPath(scenePath);
				if (!(sceneFile instanceof TFile)) {
					missingScenes.push(sceneName);
					continue;
				}
				chapters.push(await this.noteToChapter(sceneFile));
			}
			if (chapters.length === 0) {
				new Notice(
					`Manuscript Export: none of the ${project.scenes.length} scene note(s) in "${longformDisplayName(entry)}" could be found on disk.`
				);
				return;
			}
		}

		await this.writeEpub(chapters, bookTitle);

		if (missingScenes.length > 0) {
			new Notice(`Manuscript Export: skipped ${missingScenes.length} missing scene note(s): ${missingScenes.join(", ")}`);
		}
	}
}
