// Russian letters written with Latin ones, so a name typed in Russian still gets a readable address.
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Addresses the panel uses for its own pages: `/products/new` and `/collections/new` are forms, not products. */
const RESERVED = new Set(['new'])

/** A slug from a name: accents dropped, Russian letters transliterated, anything else a hyphen; at most `max` characters. */
export function slugify(name: string, max: number): string {
  const latin = [...name.toLowerCase()].map(ch => CYRILLIC[ch] ?? ch).join('')
  const slug = latin.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.slice(0, max).replace(/-+$/, '')
}

/** Lowercase Latin letters and digits in hyphen-separated words, not reserved, at most `max` characters (the database checks the same). */
export function isSlug(value: string, max: number): boolean {
  return value.length <= max && SLUG_PATTERN.test(value) && !RESERVED.has(value)
}
