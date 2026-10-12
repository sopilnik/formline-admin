// Makes the small copies of the template posters that the lists show (spec §8.4): every public/posters/<slug>.webp cut to
// fill 120 × 170 px, WebP at quality 75 — the size and quality of src/lib/thumbs.ts, which a unit test holds them to.
// Run it again whenever a poster changes: node scripts/poster-thumbs.ts
import { mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const POSTERS = new URL('../public/posters/', import.meta.url)
const THUMBS = new URL('thumb/', POSTERS)

await mkdir(THUMBS, { recursive: true })
const posters = (await readdir(POSTERS)).filter(name => name.endsWith('.webp')).sort()
for (const name of posters) {
  await sharp(fileURLToPath(new URL(name, POSTERS))).resize({ width: 120, height: 170, fit: 'cover' }).webp({ quality: 75 }).toFile(fileURLToPath(new URL(name, THUMBS)))
}
console.log(`${posters.length} small copies in public/posters/thumb/`)
