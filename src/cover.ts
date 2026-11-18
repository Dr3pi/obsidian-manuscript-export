/**
 * Cover-image helpers, kept free of Obsidian imports so the automated test
 * suite can exercise them directly. main.ts resolves the reference to a vault
 * file and reads its bytes; these functions only parse and classify.
 */

export type CoverMediaType = "image/jpeg" | "image/png";

export interface CoverImage {
	/** The raw image file, exactly as stored in the vault. */
	data: ArrayBuffer;
	mediaType: CoverMediaType;
}

/**
 * Identifies a JPEG or PNG from the file's own leading bytes rather than its
 * extension, so a mislabelled file (a .jpg that is really a WebP, say) is
 * caught before it produces a cover most e-readers can't display. Anything
 * other than JPEG/PNG returns null: those two are the formats every reading
 * system supports for covers.
 */
export function detectCoverMediaType(data: ArrayBuffer): CoverMediaType | null {
	const b = new Uint8Array(data);
	const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (b.length >= png.length && png.every((byte, i) => b[i] === byte)) return "image/png";
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
	return null;
}

/**
 * Turns a `cover` frontmatter property or the "Cover image" setting into a
 * link path Obsidian can resolve. Accepts the shapes authors actually write:
 *
 *   "[[Cover.jpg]]"            (Obsidian's property editor writes this, quoted)
 *   "![[Art/Cover.png|Front]]" (embed form, alias and heading ignored)
 *   [["Cover.jpg"]]            (unquoted [[Cover.jpg]] in YAML parses as a nested list)
 *   "Assets/cover.jpg"         (plain vault path, a leading "/" is tolerated)
 *   "![](Assets/my%20cover.jpg)" (markdown image link)
 *
 * Returns null when there is no usable reference, so "no cover set" keeps the
 * export exactly as it was before covers existed.
 */
export function parseCoverReference(value: unknown): string | null {
	// Unquoted `cover: [[Cover.jpg]]` reaches us as [["Cover.jpg"]].
	let raw: unknown = value;
	while (Array.isArray(raw) && raw.length === 1) raw = raw[0];
	if (typeof raw !== "string") return null;

	let ref = raw.trim();
	if (ref.length === 0) return null;

	const markdownLink = /^!?\[[^\]]*\]\((.+)\)$/.exec(ref);
	const wikilink = /^!?\[\[([^\]]*)\]\]$/.exec(ref);
	if (markdownLink) {
		ref = markdownLink[1].trim().replace(/^<|>$/g, "");
		try {
			ref = decodeURI(ref);
		} catch {
			// Not percent-encoded after all; use it as written.
		}
	} else if (wikilink) {
		ref = wikilink[1].split("|")[0].split("#")[0];
	}

	ref = ref.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	return ref.length > 0 ? ref : null;
}

/** File extension used inside the EPUB for a given cover type. */
export function coverExtension(mediaType: CoverMediaType): "jpg" | "png" {
	return mediaType === "image/png" ? "png" : "jpg";
}
