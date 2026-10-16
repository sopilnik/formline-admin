import type { MediaStorage } from '@/server/media/storage'

/** An in-memory stand-in for the media storage: `files` is what is stored, `failing` the paths that refuse to be deleted. */
export function memoryStorage(initial: Iterable<string> = []): MediaStorage & { paths: Set<string>; files: Map<string, Buffer>; failing: Set<string> } {
  const files = new Map<string, Buffer>([...initial].map(path => [path, Buffer.alloc(0)]))
  const failing = new Set<string>()

  return {
    files,
    failing,
    get paths() {
      return new Set(files.keys())
    },
    async put(path, bytes) {
      files.set(path, bytes)
    },
    async get(path) {
      return files.get(path) ?? null
    },
    async delete(path) {
      if (failing.has(path)) {
        throw new Error(`refused: ${path}`)
      }

      files.delete(path)
    },
  }
}
