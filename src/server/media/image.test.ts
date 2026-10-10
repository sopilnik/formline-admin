import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { THUMB } from '@/lib/thumbs'
import { processImage, sniff, type Processed } from '@/server/media/image'

const solid = (width: number, height: number, background = '#1d3557') => sharp({ create: { width, height, channels: 3, background } })

/** A PNG whose header claims other dimensions: the decoder must refuse it by the header alone. */
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(await solid(1, 1).png().toBuffer())
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29)
  return png
}

const processed = (result: Processed | string): Processed => {
  if (typeof result === 'string') throw new Error(result)
  return result
}

describe('sniff', () => {
  it('knows JPEG, PNG and WebP by their first bytes', async () => {
    expect(sniff(await solid(2, 2).jpeg().toBuffer())).toBe('jpeg')
    expect(sniff(await solid(2, 2).png().toBuffer())).toBe('png')
    expect(sniff(await solid(2, 2).webp().toBuffer())).toBe('webp')
  })

  it('refuses everything else', async () => {
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniff(await solid(2, 2).gif().toBuffer())).toBeNull()
    expect(sniff(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt '))).toBeNull()
    expect(sniff(new Uint8Array(0))).toBeNull()
  })
})

describe('processImage', () => {
  it('makes the lists’ small copy beside the image: cut to fill, at their size, as WebP', async () => {
    const out = processed(await processImage(await solid(1200, 800).png().toBuffer()))
    const meta = await sharp(out.thumb).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', THUMB.width, THUMB.height])
  })

  it('re-encodes to WebP at the same size', async () => {
    const out = processed(await processImage(await solid(1200, 800).png().toBuffer()))
    expect([out.width, out.height]).toEqual([1200, 800])
    expect(sniff(out.bytes)).toBe('webp')
    expect(out.bytes.length).toBeGreaterThan(0)
  })

  it('fits the longest side into 2000 px and never enlarges', async () => {
    const wide = processed(await processImage(await solid(3000, 1500).jpeg().toBuffer()))
    expect([wide.width, wide.height]).toEqual([2000, 1000])
    const small = processed(await processImage(await solid(300, 420).webp().toBuffer()))
    expect([small.width, small.height]).toEqual([300, 420])
  })

  it('turns the picture upright and strips the metadata', async () => {
    const sideways = await solid(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const out = processed(await processImage(sideways))
    expect([out.width, out.height]).toEqual([20, 40])
    const meta = await sharp(out.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
  })

  it('keeps the first frame of an animation', async () => {
    const frames = await Promise.all(['#d62828', '#1d3557'].map(colour => solid(10, 20, colour).png().toBuffer()))
    const animated = await sharp(frames, { join: { animated: true } }).webp({ loop: 0 }).toBuffer()
    expect((await sharp(animated).metadata()).pages).toBe(2)
    const out = processed(await processImage(animated))
    expect([out.width, out.height]).toEqual([10, 20])
    expect((await sharp(out.bytes).metadata()).pages ?? 1).toBe(1)
  })

  it('refuses anything that is not JPEG, PNG or WebP, even under a borrowed name', async () => {
    expect(await processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toBe('type')
    expect(await processImage(await solid(4, 4).gif().toBuffer())).toBe('type')
    const png = await solid(4, 4).png().toBuffer()
    expect(await processImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), png]))).not.toHaveProperty('bytes')
  })

  it('refuses more than 40 megapixels by the header, before decoding', async () => {
    expect(await processImage(await pngClaiming(10_000, 5_000))).toBe('pixels')
  })

  it('refuses a picture that does not decode', async () => {
    const png = await solid(64, 64).png().toBuffer()
    expect(await processImage(png.subarray(0, 60))).toBe('decode')
  })

  it('handles uploads one after another', async () => {
    const inputs = await Promise.all([solid(500, 500).png().toBuffer(), solid(600, 300).png().toBuffer(), solid(100, 900).png().toBuffer()])
    const outs = (await Promise.all(inputs.map(processImage))).map(processed)
    expect(outs.map(o => [o.width, o.height])).toEqual([[500, 500], [600, 300], [100, 900]])
  })
})
