import 'server-only'

/**
 * Reads a request body up to `max` bytes and stops reading beyond it: the streaming guard of the image upload
 * and of the Stripe webhook, which both take a raw body.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer | 'too_large'> {
  if (!body) {
    return Buffer.alloc(0)
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    size += value.byteLength

    if (size > max) {
      await reader.cancel().catch(() => undefined)

      return 'too_large'
    }

    chunks.push(value)
  }

  return Buffer.concat(chunks)
}
