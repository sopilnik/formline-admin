// The store's size and palette names, as db/seed/catalog.ts has them (src/lib/catalog.test.ts keeps the two in step).
// They are the products' own names, so they are not translated.
const SIZE_NAMES: Record<string, string> = { a3: 'A3', a2: 'A2', a1: 'A1' }
const PALETTE_NAMES: Record<string, string> = { paper: 'Paper', ink: 'Ink', signal: 'Signal', ocean: 'Ocean', sage: 'Sage', sand: 'Sand' }

/** "A1 · Ink"; an unknown size or palette shows as stored. */
export function variantLabel(size: string, palette: string): string {
  return `${SIZE_NAMES[size] ?? size.toUpperCase()} · ${PALETTE_NAMES[palette] ?? palette}`
}

/** Template posters ship with the app under public/; an upload is served by the media route after a session check (stage 5). */
export function imageSrc(image: { id: string; storagePath: string; source: 'static' | 'upload' }): string {
  return image.source === 'static' ? `/${image.storagePath}` : `/media/${image.id}`
}
