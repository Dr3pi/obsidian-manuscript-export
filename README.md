# Manuscript Export

Export a book manuscript written in Obsidian — one note per chapter — to a clean, valid EPUB. No separate paid tool, no leaving Obsidian.

## Why

If you write long-form fiction or nonfiction in Obsidian (the same way the [Longform](https://github.com/kevboh/longform) plugin's users do), getting a properly formatted EPUB out the other end usually means a separate paid tool (Vellum, Atticus) or a fragile export plugin. This handles the common case cleanly:

- **Wikilinks** (`[[Note]]`, `[[Note|Display text]]`) render as plain text — a reader doesn't care about your internal note names.
- **Image embeds** (`![[cover.png]]`) are embedded directly into the EPUB.
- **Scene breaks** (`***` or `---` on their own line) render as a centered divider.
- **Callouts** (`> [!note] ...`) are stripped entirely, not rendered — they're almost always private author annotations (reminders, continuity notes), not content meant for a reader.
- **Plain blockquotes** (no `[!type]` marker) render normally, for genuine in-story quotes.
- Standard **bold**/*italic* formatting.

## Installation

**Not yet in Obsidian's community plugin directory** (submission in progress). Until then, install manually:

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](../../releases/latest).
2. Create a folder named `manuscript-export` inside your vault's `.obsidian/plugins/` directory.
3. Put the three downloaded files in that folder.
4. In Obsidian, go to **Settings → Community plugins**, and enable **Manuscript Export**.

## Usage

1. Go to the plugin's settings tab and set: book title, author name, language, the vault folder containing your chapter notes (one note per chapter, in the order you want them exported), and an output folder.
2. Run the **"Export manuscript to EPUB"** command (`Ctrl+P` / `Cmd+P`, then search for it).
3. Your `.epub` file appears in the output folder you configured.

## Current limitations (v0.1.0)

- EPUB export only — no print-PDF export yet.
- Non-image note embeds (`![[Another Note]]`, transcluding another note's content) are silently skipped, not resolved.
- Chapter order is filename-based (natural sort — "Chapter 2" sorts before "Chapter 10"), not integrated with Longform's own chapter index yet.

## Development

```
npm install
npm run dev      # watch mode
npm run build    # production build -> main.js
npm test         # validates markdown conversion + EPUB structure, no Obsidian required
```

## License

MIT — see [LICENSE](LICENSE).
