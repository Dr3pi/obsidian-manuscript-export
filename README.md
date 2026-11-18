# Manuscript Export

Export a book manuscript written in Obsidian to a clean, valid EPUB — including one-command export of [Longform](https://github.com/kevboh/longform) projects. No separate paid tool, no leaving Obsidian.

## Works with Longform

If you write in Longform, you already have your scenes in order. Run **"Export Longform project to EPUB"** and you get a properly structured EPUB of that project — scenes exported in your Longform order (not filename order), with the project's title as the book title. Multiple projects in one vault? You'll get a picker. Single-file Longform projects are split into chapters on `#` headings.

No Longform? Use **"Export manuscript to EPUB"** with a plain folder of chapter notes (one note per chapter, natural-sort filename order — "Chapter 2" correctly sorts before "Chapter 10").

## Covers

New in 0.3.0: give the EPUB a cover, so e-readers and Calibre show your book instead of a generic placeholder. JPG or PNG.

- **Longform:** add a `cover` property to the project's index note, next to `longform:` rather than inside it (Longform rewrites that block when scenes change). A wikilink or a vault path both work:

  ```yaml
  cover: "[[Cover.jpg]]"
  longform:
    format: scenes
    # ...
  ```

- **Folder export:** set **Cover image** in the plugin settings, e.g. `Manuscript/Assets/cover.jpg`.

No cover set means no change: the export is exactly what it was before. If the cover can't be found or isn't a JPG or PNG, the book still exports, without a cover, and a notice tells you why. Longform exports only use the project's own `cover` property, never the settings one, so a cover meant for one book can't end up on another.

## Why

If you write long-form fiction or nonfiction in Obsidian, getting a properly formatted EPUB out the other end usually means a separate paid tool (Vellum, Atticus) or a fragile export chain. This handles the common case cleanly:

- **Wikilinks** (`[[Note]]`, `[[Note|Display text]]`) render as plain text — a reader doesn't care about your internal note names.
- **Image embeds** (`![[village-map.png]]`) are embedded directly into the EPUB.
- **Scene breaks** (`***` or `---` on their own line) render as a centered divider.
- **YAML frontmatter** is stripped — metadata never leaks into your book.
- **Callouts** (`> [!note] ...`) are stripped entirely, not rendered — they're almost always private author annotations (reminders, continuity notes), not content meant for a reader.
- **Plain blockquotes** (no `[!type]` marker) render normally, for genuine in-story quotes.
- Standard **bold**/*italic* formatting.

Chapter titles come from a note's `title:` frontmatter field, its leading `# Heading`, or its filename — in that order.

## Installation

In Obsidian: **Settings → Community plugins → Browse**, search for **"Manuscript Export"**, install, and enable.

Or manually: download `manifest.json`, `main.js`, and `styles.css` from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/manuscript-export/`, then enable the plugin under **Settings → Community plugins**.

## Usage

1. In the plugin's settings tab, set your author name, language, and an output folder (book title is optional — Longform exports default to the project's own title). For folder-based export, also set the manuscript folder.
2. Open the command palette (`Ctrl+P` / `Cmd+P`) and run **"Export Longform project to EPUB"** or **"Export manuscript to EPUB"**.
3. Your `.epub` appears in the output folder, ready for Calibre, Kindle Previewer, or your distributor of choice.

## Current limitations (v0.3.0)

- EPUB export only — no print-PDF export yet.
- Non-image note embeds (`![[Another Note]]`, transcluding another note's content) are silently skipped, not resolved.
- Nested Longform scenes are flattened — every scene becomes its own chapter; indentation isn't rendered as a part/chapter hierarchy yet.

Missing something you need? [Open an issue](../../issues) — real requests from real manuscripts drive what gets built next.

## Development

```
npm install
npm run dev      # watch mode
npm run build    # production build -> main.js
npm test         # validates markdown conversion, Longform parsing + EPUB structure, no Obsidian required
```

## License

MIT — see [LICENSE](LICENSE).
