// The store's size and palette names, as db/seed/catalog.ts has them (src/lib/catalog.test.ts keeps the two in step).
// They are the products' own names, so they are not translated.
const SIZE_NAMES: Record<string, string> = { a3: 'A3', a2: 'A2', a1: 'A1' }
const PALETTE_NAMES: Record<string, string> = { paper: 'Paper', ink: 'Ink', signal: 'Signal', ocean: 'Ocean', sage: 'Sage', sand: 'Sand' }

/** The store's palettes in its own order: the choices of a new product and the order of its variants. */
export const PALETTE_IDS: readonly string[] = Object.keys(PALETTE_NAMES)
const SIZE_ORDER = Object.keys(SIZE_NAMES)

/** Variants in the store's order: by palette, then A3, A2, A1. */
export function compareVariants(a: { size: string; palette: string }, b: { size: string; palette: string }): number {
  return PALETTE_IDS.indexOf(a.palette) - PALETTE_IDS.indexOf(b.palette) || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
}

/** "Ocean"; an unknown palette shows as stored. */
export function paletteName(palette: string): string {
  return PALETTE_NAMES[palette] ?? palette
}

/** "A1 · Ink"; an unknown size or palette shows as stored. */
export function variantLabel(size: string, palette: string): string {
  return `${SIZE_NAMES[size] ?? size.toUpperCase()} · ${paletteName(palette)}`
}

/** Template posters ship with the app under public/; an upload is served by the media route after a session check. */
export function imageSrc(image: { id: string; storagePath: string; source: 'static' | 'upload' }): string {
  return image.source === 'static' ? `/${image.storagePath}` : `/media/${image.id}`
}
