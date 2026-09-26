export type CollectionSlug = 'monochrome' | 'primary' | 'pastel' | 'night'
export type PaletteId = 'paper' | 'ink' | 'signal' | 'ocean' | 'sage' | 'sand'
export type SizeId = 'a3' | 'a2' | 'a1'

export type CatalogCollection = { slug: CollectionSlug; name: string; description: string }
export type CatalogProduct = {
  slug: string
  name: string
  collection: CollectionSlug
  palettes: readonly [PaletteId, ...PaletteId[]]
  basePriceCents: number
  tags: readonly string[]
  description: string
}
export type CatalogPoster = { width: number; height: number; bytes: number }

export const COLLECTIONS: readonly CatalogCollection[] = [
  { slug: 'monochrome', name: 'Monochrome', description: 'Black, off-white and a single accent. Posters that behave in any room.' },
  { slug: 'primary', name: 'Primary', description: 'Red, navy and paper. The loud shelf of the shop: big shapes, big letters, colours that do not ask permission.' },
  { slug: 'pastel', name: 'Pastel', description: 'Sage and sand. Soft grounds, quiet geometry.' },
  { slug: 'night', name: 'Night', description: 'Dark grounds for dark walls. Ink black and deep navy, with one warm accent each.' },
]

export const PALETTES: Record<PaletteId, string> = {
  paper: 'Paper',
  ink: 'Ink',
  signal: 'Signal',
  ocean: 'Ocean',
  sage: 'Sage',
  sand: 'Sand',
}

export const SIZES: readonly { id: SizeId; label: string; surchargeCents: number }[] = [
  { id: 'a3', label: 'A3', surchargeCents: 0 },
  { id: 'a2', label: 'A2', surchargeCents: 1600 },
  { id: 'a1', label: 'A1', surchargeCents: 4000 },
]

export const SHIPPING_CENTS = { standard: 900, express: 1900 } as const
export const FREE_SHIPPING_FROM_CENTS = 15_000

export const PRODUCTS: readonly CatalogProduct[] = [
  { slug: 'quiet-hours', name: 'Quiet Hours', collection: 'monochrome', palettes: ['paper', 'ink'], basePriceCents: 2900, tags: ['type', 'word', 'minimal'],
    description: 'One word set large, with a hairline underneath. The kind of poster that does the talking for an empty wall.' },
  { slug: 'ninety-six', name: 'Ninety-Six', collection: 'monochrome', palettes: ['paper', 'ink'], basePriceCents: 2600, tags: ['grid', 'geometric'],
    description: 'Ninety-six cells, some filled, some left open.' },
  { slug: 'low-tide', name: 'Low Tide', collection: 'monochrome', palettes: ['ink', 'paper'], basePriceCents: 3100, tags: ['circles', 'orbit', 'calm'],
    description: 'Nine rings drifting off centre. Reads as water from across the room and as geometry up close.' },
  { slug: 'sixteen-lines', name: 'Sixteen Lines', collection: 'monochrome', palettes: ['paper', 'ink'], basePriceCents: 2400, tags: ['stripes', 'lines', 'numeral'],
    description: 'Sixteen horizontal bands and a numeral. Plain, deliberate, easy to live with.' },
  { slug: 'red-corner', name: 'Red Corner', collection: 'primary', palettes: ['signal', 'paper', 'ocean'], basePriceCents: 3300, tags: ['blocks', 'bauhaus', 'red'],
    description: 'A quarter circle pinned in the corner and three rectangles keeping their distance. Loud in red, calm in paper.' },
  { slug: 'seven-diagonals', name: 'Seven Diagonals', collection: 'primary', palettes: ['ocean', 'signal', 'paper'], basePriceCents: 2800, tags: ['stripes', 'diagonal', 'numeral'],
    description: 'Seven bands at thirty degrees with a large seven riding across them.' },
  { slug: 'loud', name: 'Loud', collection: 'primary', palettes: ['signal', 'ocean'], basePriceCents: 2900, tags: ['type', 'word', 'bold'],
    description: 'Four letters at full width. Say it with your wall.' },
  { slug: 'nine-by-twelve', name: 'Nine by Twelve', collection: 'primary', palettes: ['ocean', 'signal', 'paper'], basePriceCents: 2600, tags: ['grid', 'circles', 'squares'],
    description: 'A nine-by-twelve grid where circles and squares take turns. Busy from a distance, orderly up close, and it changes character completely between navy and paper.' },
  { slug: 'morning-orbit', name: 'Morning Orbit', collection: 'pastel', palettes: ['sage', 'sand', 'paper'], basePriceCents: 3100, tags: ['circles', 'orbit', 'soft'],
    description: 'Six soft rings on sage green, offset just enough to feel hand-placed.' },
  { slug: 'sand-blocks', name: 'Sand Blocks', collection: 'pastel', palettes: ['sand', 'sage'], basePriceCents: 3300, tags: ['blocks', 'warm', 'stacked'],
    description: 'Stacked rectangles in warm sand tones. A quiet composition for a bedroom or a hallway.' },
  { slug: 'sparse', name: 'Sparse', collection: 'pastel', palettes: ['sage', 'sand', 'paper'], basePriceCents: 2600, tags: ['grid', 'minimal', 'empty'],
    description: 'A six-by-nine grid mostly left empty. The gaps are the point.' },
  { slug: 'slow', name: 'Slow', collection: 'pastel', palettes: ['sand', 'sage'], basePriceCents: 2900, tags: ['type', 'word', 'light'],
    description: 'Set light, aligned right, with a rule under it. For rooms where nothing needs to happen fast.' },
  { slug: 'after-dark', name: 'After Dark', collection: 'night', palettes: ['ink', 'ocean'], basePriceCents: 2400, tags: ['stripes', 'vertical', 'numeral'],
    description: 'Twenty-four vertical bands and the number of hours in a day.' },
  { slug: 'far-orbit', name: 'Far Orbit', collection: 'night', palettes: ['ink', 'ocean'], basePriceCents: 3100, tags: ['circles', 'orbit', 'dark'],
    description: 'Twelve rings pushed far off centre on a black ground. The largest one runs off the edge, which is where it belongs.' },
  { slug: 'night-blocks', name: 'Night Blocks', collection: 'night', palettes: ['ocean', 'ink'], basePriceCents: 3300, tags: ['blocks', 'navy', 'split'],
    description: 'A split composition in navy: two big fields, one quarter circle, one warm accent.' },
  { slug: 'hush', name: 'Hush', collection: 'night', palettes: ['ink', 'ocean'], basePriceCents: 2900, tags: ['type', 'word', 'dark'],
    description: 'Bold letters on black.' },
]

/** The poster files in public/posters/<slug>.webp; the sizes are pinned so a swapped file is noticed. */
export const POSTERS: Record<string, CatalogPoster> = {
  'after-dark': { width: 720, height: 1018, bytes: 9580 },
  'far-orbit': { width: 720, height: 1018, bytes: 46240 },
  hush: { width: 720, height: 1018, bytes: 4560 },
  loud: { width: 720, height: 1018, bytes: 6188 },
  'low-tide': { width: 720, height: 1018, bytes: 38134 },
  'morning-orbit': { width: 720, height: 1018, bytes: 24558 },
  'night-blocks': { width: 720, height: 1018, bytes: 2796 },
  'nine-by-twelve': { width: 720, height: 1018, bytes: 17170 },
  'ninety-six': { width: 720, height: 1018, bytes: 18998 },
  'quiet-hours': { width: 720, height: 1018, bytes: 4676 },
  'red-corner': { width: 720, height: 1018, bytes: 3544 },
  'sand-blocks': { width: 720, height: 1018, bytes: 2884 },
  'seven-diagonals': { width: 720, height: 1018, bytes: 9272 },
  'sixteen-lines': { width: 720, height: 1018, bytes: 8908 },
  slow: { width: 720, height: 1018, bytes: 6874 },
  sparse: { width: 720, height: 1018, bytes: 8022 },
}

export function skuOf(productSlug: string, size: SizeId, palette: PaletteId): string {
  return `${productSlug}-${size}-${palette}`
}

export function unitPriceCents(product: CatalogProduct, size: SizeId): number {
  return product.basePriceCents + SIZES.find(s => s.id === size)!.surchargeCents
}

export function shippingCents(subtotalCents: number, delivery: 'standard' | 'express'): number {
  return subtotalCents >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_CENTS[delivery]
}
