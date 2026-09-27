import type { MediaStorage } from '@/server/media/storage'

/** An in-memory stand-in for the media storage: `paths` is what exists, `failing` what refuses to be deleted. */
export function memoryStorage(initial: Iterable<string> = []): MediaStorage & { paths: Set<string>; failing: Set<string> } {
  const paths = new Set(initial)
  const failing = new Set<string>()
  return {
    paths,
    failing,
    async delete(path) {
      if (failing.has(path)) throw new Error(`refused: ${path}`)
      paths.delete(path)
    },
  }
}
