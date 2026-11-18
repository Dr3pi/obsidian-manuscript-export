import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type ManuscriptExportPlugin from "./main";

export interface ManuscriptExportSettings {
	bookTitle: string;
	authorName: string;
	language: string;
	/** Vault-relative path to the folder containing one manuscript note per chapter, in export order. */
	manuscriptFolder: string;
	/** Vault-relative folder the finished .epub gets written into. */
	outputFolder: string;
	/** Optional JPG/PNG cover for folder exports: a vault path or [[wikilink]]. */
	coverImage: string;
}

export const DEFAULT_SETTINGS: ManuscriptExportSettings = {
	bookTitle: "",
	authorName: "",
	language: "en",
	manuscriptFolder: "",
	outputFolder: "",
	coverImage: "",
};

const COVER_IMAGE_DESC =
	"Optional JPG or PNG shown as the book's cover in folder exports. Use a vault path (Manuscript/Assets/cover.jpg) or a [[wikilink]]. Longform exports use the cover property on the project's index note instead, e.g. cover: \"[[Cover.jpg]]\".";

/** Per-field normalization, matching the previous imperative onChange handlers exactly. */
function normalizeSettingValue(key: keyof ManuscriptExportSettings, value: string): string {
	switch (key) {
		case "language":
			return value.trim() || "en";
		case "manuscriptFolder":
		case "outputFolder":
		case "coverImage":
			return value.trim();
		default:
			return value;
	}
}

export class ManuscriptExportSettingTab extends PluginSettingTab {
	plugin: ManuscriptExportPlugin;

	constructor(app: App, plugin: ManuscriptExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Obsidian 1.13.0+: declarative settings, discoverable via Obsidian's own settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Book title",
				desc: "Used as the EPUB's title and shown in e-readers. Longform exports use the project's own title instead.",
				control: { type: "text", key: "bookTitle", placeholder: "My Manuscript" },
			},
			{
				name: "Author name",
				control: { type: "text", key: "authorName", placeholder: "Your name" },
			},
			{
				name: "Language",
				desc: "ISO 639-1 code, e.g. en, fr, de.",
				control: { type: "text", key: "language", placeholder: "en" },
			},
			{
				name: "Manuscript folder",
				desc:
					"Vault folder containing one note per chapter. Notes export in the same order Obsidian's file explorer sorts them in (name/numeric prefix), so number your chapter files if order matters.",
				control: { type: "text", key: "manuscriptFolder", placeholder: "Manuscript/Chapters" },
			},
			{
				name: "Output folder",
				desc: "Vault folder the finished .epub file is written into. Leave blank for the vault root.",
				control: { type: "text", key: "outputFolder", placeholder: "Manuscript/Exports" },
			},
			{
				name: "Cover image",
				desc: COVER_IMAGE_DESC,
				control: { type: "text", key: "coverImage", placeholder: "Manuscript/Assets/cover.jpg" },
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof ManuscriptExportSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settingKey = key as keyof ManuscriptExportSettings;
		this.plugin.settings[settingKey] = normalizeSettingValue(settingKey, String(value ?? ""));
		await this.plugin.saveSettings();
	}

	/** Fallback for Obsidian versions older than 1.13.0 -- not called once getSettingDefinitions() is used. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Book title")
			.setDesc("Used as the EPUB's title and shown in e-readers. Longform exports use the project's own title instead.")
			.addText((text) =>
				text
					.setPlaceholder("My Manuscript")
					.setValue(this.plugin.settings.bookTitle)
					.onChange(async (value) => {
						this.plugin.settings.bookTitle = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Author name")
			.addText((text) =>
				text
					.setPlaceholder("Your name")
					.setValue(this.plugin.settings.authorName)
					.onChange(async (value) => {
						this.plugin.settings.authorName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Language")
			.setDesc("ISO 639-1 code, e.g. en, fr, de.")
			.addText((text) =>
				text
					.setPlaceholder("en")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value.trim() || "en";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Manuscript folder")
			.setDesc(
				"Vault folder containing one note per chapter. Notes export in the same order Obsidian's file explorer sorts them in (name/numeric prefix), so number your chapter files if order matters."
			)
			.addText((text) =>
				text
					.setPlaceholder("Manuscript/Chapters")
					.setValue(this.plugin.settings.manuscriptFolder)
					.onChange(async (value) => {
						this.plugin.settings.manuscriptFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Vault folder the finished .epub file is written into. Leave blank for the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Manuscript/Exports")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cover image")
			.setDesc(COVER_IMAGE_DESC)
			.addText((text) =>
				text
					.setPlaceholder("Manuscript/Assets/cover.jpg")
					.setValue(this.plugin.settings.coverImage)
					.onChange(async (value) => {
						this.plugin.settings.coverImage = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
