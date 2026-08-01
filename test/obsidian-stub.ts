/**
 * Minimal in-memory stand-in for the `obsidian` package, letting the
 * integration test (test/integration.test.mjs) drive the real plugin class
 * in src/main.ts outside a running vault. Only the API surface main.ts and
 * settings.ts actually touch is implemented. The harness build
 * (test/build-harness.mjs) redirects the `obsidian` import here; tsc still
 * checks src/ against the real obsidian typings.
 */

export type SettingDefinitionItem = Record<string, unknown>;

/** Obsidian collapses slashes and strips the leading/trailing ones; root is "/". */
export function normalizePath(path: string): string {
	const trimmed = path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
	return trimmed === "" ? "/" : trimmed;
}

/** Every Notice message shown during a test run, in order. */
export const notices: string[] = [];

export function resetNotices(): void {
	notices.length = 0;
}

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class TAbstractFile {
	path = "";
	name = "";
	parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
	basename = "";
	extension = "";
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export interface StubCacheEntry {
	frontmatter?: Record<string, unknown>;
	frontmatterPosition?: { end: { offset: number } };
}

export class Vault {
	root: TFolder;
	private contents = new Map<string, string | ArrayBuffer>();
	private nodes = new Map<string, TAbstractFile>();

	constructor() {
		this.root = new TFolder();
		this.root.path = "/";
		this.nodes.set("/", this.root);
	}

	private ensureFolder(path: string): TFolder {
		if (path === "" || path === "/") return this.root;
		const existing = this.nodes.get(path);
		if (existing instanceof TFolder) return existing;
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
		const parent = this.ensureFolder(parentPath);
		const folder = new TFolder();
		folder.path = path;
		folder.name = path.slice(path.lastIndexOf("/") + 1);
		folder.parent = parent;
		parent.children.push(folder);
		this.nodes.set(path, folder);
		return folder;
	}

	/** Test helper -- registers a file (and its parent folders) in the fake vault. */
	addFile(path: string, content: string | ArrayBuffer): TFile {
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
		const parent = this.ensureFolder(parentPath);
		const file = new TFile();
		file.path = path;
		file.name = path.slice(path.lastIndexOf("/") + 1);
		file.extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "";
		file.basename = file.extension ? file.name.slice(0, -(file.extension.length + 1)) : file.name;
		file.parent = parent;
		parent.children.push(file);
		this.nodes.set(path, file);
		this.contents.set(path, content);
		return file;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.nodes.get(path) ?? null;
	}

	getMarkdownFiles(): TFile[] {
		return Array.from(this.nodes.values()).filter((n): n is TFile => n instanceof TFile && n.extension === "md");
	}

	async read(file: TFile): Promise<string> {
		const content = this.contents.get(file.path);
		if (typeof content !== "string") throw new Error(`No text content at ${file.path}`);
		return content;
	}

	async readBinary(file: TFile): Promise<ArrayBuffer> {
		const content = this.contents.get(file.path);
		if (!(content instanceof ArrayBuffer)) throw new Error(`No binary content at ${file.path}`);
		return content;
	}

	async createFolder(path: string): Promise<void> {
		this.ensureFolder(path);
	}

	async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		return this.addFile(path, data);
	}

	async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
		this.contents.set(file.path, data);
	}

	/** Test helper -- the binary written at a path, or null. */
	binaryAt(path: string): ArrayBuffer | null {
		const content = this.contents.get(path);
		return content instanceof ArrayBuffer ? content : null;
	}
}

export class MetadataCache {
	private caches = new Map<string, StubCacheEntry>();

	/** Test helper -- what getFileCache() will report for a path. */
	setCache(path: string, entry: StubCacheEntry): void {
		this.caches.set(path, entry);
	}

	getFileCache(file: TFile): StubCacheEntry | null {
		return this.caches.get(file.path) ?? null;
	}

	getFirstLinkpathDest(_target: string, _sourcePath: string): TFile | null {
		return null;
	}
}

export class App {
	vault = new Vault();
	metadataCache = new MetadataCache();
}

export class Plugin {
	app: App;
	manifest: unknown;
	commands: Array<{ id: string; name: string; callback: () => unknown }> = [];
	private data: unknown = null;

	constructor(app: App, manifest?: unknown) {
		this.app = app;
		this.manifest = manifest;
	}

	addCommand(command: { id: string; name: string; callback: () => unknown }): void {
		this.commands.push(command);
	}

	addSettingTab(_tab: unknown): void {}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: unknown): Promise<void> {
		this.data = data;
	}
}

export class PluginSettingTab {
	app: App;

	constructor(app: App, _plugin: unknown) {
		this.app = app;
	}
}

export class Setting {
	constructor(_containerEl: unknown) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (text: unknown) => unknown): this {
		return this;
	}
}

export class FuzzySuggestModal<T> {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	setPlaceholder(_text: string): void {}

	getItems(): T[] {
		return [];
	}

	getItemText(_item: T): string {
		return "";
	}

	onChooseItem(_item: T): void {}

	/** The stub "UI": immediately chooses the first item, deterministically. */
	open(): void {
		const items = this.getItems();
		if (items.length > 0) this.onChooseItem(items[0]);
	}
}
