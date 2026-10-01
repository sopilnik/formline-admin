import { describe, expect, it } from 'vitest'
import { readCapped } from '@/server/read-capped'

function streamOf(...chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(1))
      controller.close()
    },
  })
}

describe('readCapped', () => {
  it('reads a body up to the limit', async () => {
    expect((await readCapped(streamOf(600, 400), 1000) as Buffer).length).toBe(1000)
    expect((await readCapped(null, 1000) as Buffer).length).toBe(0)
  })

  it('stops at the first byte beyond it', async () => {
    expect(await readCapped(streamOf(600, 401), 1000)).toBe('too_large')
  })
})
