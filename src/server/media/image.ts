import 'server-only'
import sharp from 'sharp'
import { THUMB } from '@/lib/thumbs'

// The container caps itself, so image work is serialised and uncached.
sharp.concurrency(1)
sharp.cache(false)

export const MAX_PIXELS = 40_000_000
export const LONGEST_SIDE = 2000
export const WEBP_QUALITY = 82

export type ImageKind = 'jpeg' | 'png' | 'webp'

const starts = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte)

/** The format by its magic bytes: JPEG, PNG and WebP only; anything else, SVG and GIF included, is null. */
export function sniff(bytes: Uint8Array): ImageKind | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  return null
}

export type Processed = { bytes: Buffer; width: number; height: number; thumb: Buffer }
export type ImageProblem = 'type' | 'pixels' | 'decode'

// One image at a time, process-wide: a second upload waits for the first.
let queue: Promise<unknown> = Promise.resolve()

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

/**
 * Checks and re-encodes an upload: the magic bytes and the decoder must agree on
 * JPEG, PNG or WebP; at most 40 megapixels; the first frame only; turned upright by its EXIF
 * orientation; at most 2000 px on the longest side; WebP at quality 82 with every piece of
 * metadata stripped. Beside it, the small copy the lists show.
 */
export function processImage(bytes: Buffer): Promise<Processed | ImageProblem> {
  const kind = sniff(bytes)
  if (!kind) return Promise.resolve('type')
  return oneAtATime(async () => {
    try {
      const input = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error', pages: 1, autoOrient: true })
      const meta = await input.metadata()
      if (meta.format !== kind) return 'type'
      if ((meta.width ?? 0) * (meta.pageHeight ?? meta.height ?? 0) > MAX_PIXELS) return 'pixels'
      const { data, info } = await input.clone()
        .resize({ width: LONGEST_SIDE, height: LONGEST_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true })
      const thumb = await input.clone().resize({ width: THUMB.width, height: THUMB.height, fit: 'cover' }).webp({ quality: THUMB.quality }).toBuffer()
      return { bytes: data, width: info.width, height: info.height, thumb }
    } catch (error) {
      // libvips says "Input image exceeds pixel limit" past limitInputPixels. The header check above already refuses every
      // such image, so no test reaches this line; it stays so a picture whose header understates it is still "too large".
      return error instanceof Error && /pixel limit/i.test(error.message) ? 'pixels' : 'decode'
    }
  })
}
