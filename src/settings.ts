import { App, PluginSettingTab, Setting } from "obsidian";
import type ManuscriptExportPlugin from "./main";

export interface ManuscriptExportSettings {
	bookTitle: string;
	authorName: string;
	language: string;
	/** Vault-relative path to the folder containing one manuscript note per chapter, in export order. */
	manuscriptFolder: string;
	/** Vault-relative folder the finished .epub gets written into. */
	outputFolder: string;
}

export const DEFAULT_SETTINGS: ManuscriptExportSettings = {
	bookTitle: "",
	authorName: "",
	language: "en",
	manuscriptFolder: "",
	outputFolder: "",
};

export class ManuscriptExportSettingTab extends PluginSettingTab {
	plugin: ManuscriptExportPlugin;

	constructor(app: App, plugin: ManuscriptExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Book title")
			.setDesc("Used as the EPUB's title and shown in e-readers.")
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
	}
}
