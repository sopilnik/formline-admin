// The store names each Checkout line "<Product> · <Size> · <Palette>" and sends no SKU (spec §7.2). The name is read
// against the catalog snapshot the template is built from, never against the panel's catalog, which the owner may edit.
// eslint-disable-next-line no-restricted-imports
import { PALETTES, PRODUCTS, SIZES, skuOf, type PaletteId, type SizeId } from '../../../db/seed/catalog'

export type LineVariant = { sku: string; size: SizeId; palette: PaletteId }

const SEPARATOR = ' · '
const PALETTE_BY_NAME = new Map(Object.entries(PALETTES).map(([id, name]) => [name, id as PaletteId]))

/** The variant a line name stands for; null for a name the store does not write. */
export function parseLineName(name: string): LineVariant | null {
  const parts = name.split(SEPARATOR)
  if (parts.length !== 3) return null
  const [productName, sizeLabel, paletteName] = parts as [string, string, string]
  const product = PRODUCTS.find(p => p.name === productName)
  const size = SIZES.find(s => s.label === sizeLabel)
  const palette = PALETTE_BY_NAME.get(paletteName)
  if (!product || !size || !palette || !product.palettes.includes(palette)) return null
  return { sku: skuOf(product.slug, size.id, palette), size: size.id, palette }
}
