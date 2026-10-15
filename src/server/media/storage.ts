import 'server-only'
import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readEnv, type Env, type EnvSource } from '@/server/env'

/** Where uploaded images live: the bunny media zone, or a local folder in development and tests. */
export interface MediaStorage {
  put(path: string, bytes: Buffer): Promise<void>
  /** The stored bytes, or null when nothing is stored at the path. */
  get(path: string): Promise<Buffer | null>
  /** Removes the file; a file that is already gone counts as removed. */
  delete(path: string): Promise<void>
}

/** Every upload is `ws/<workspace>/<image>.webp`, its small copy `….thumb.webp` beside it; nothing else is ever written, read or deleted. */
export const MEDIA_PATH = /^ws\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(\.thumb)?\.webp$/

export function mediaPath(workspaceId: string, imageId: string): string {
  return `ws/${workspaceId}/${imageId}.webp`
}

/** Where an upload's small copy lives: beside it, under the same name. */
export function thumbPath(path: string): string {
  return path.replace(/\.webp$/, '.thumb.webp')
}

function checked(path: string): string {
  if (!MEDIA_PATH.test(path)) {
    throw new Error(`not a media path: ${path}`)
  }

  return path
}

/** Without a configured zone nothing can be stored; every queued deletion is retried later. */
export const unavailableStorage: MediaStorage = {
  async put() {
    throw new Error('media storage is not configured')
  },
  async get() {
    throw new Error('media storage is not configured')
  },
  async delete() {
    throw new Error('media storage is not configured')
  },
}

export type BunnyZone = { zone: string; host: string; key: string }

const TIMEOUT_MS = 15_000

/** bunny Storage's HTTP API: PUT with a SHA-256 checksum the zone verifies, GET, DELETE; the key stays in the AccessKey header. */
export function bunnyStorage(zone: BunnyZone, fetchImpl: typeof fetch = fetch): MediaStorage {
  const url = (path: string): string => `https://${zone.host}/${zone.zone}/${checked(path)}`
  const request = (path: string, init: RequestInit): Promise<Response> =>
    fetchImpl(url(path), { ...init, headers: { AccessKey: zone.key, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })

  return {
    async put(path, bytes) {
      const checksum = createHash('sha256').update(bytes).digest('hex').toUpperCase()
      const response = await request(path, { method: 'PUT', body: new Uint8Array(bytes), headers: { 'Content-Type': 'application/octet-stream', Checksum: checksum } })

      if (!response.ok) {
        throw new Error(`media storage refused the upload: ${response.status}`)
      }
    },
    async get(path) {
      const response = await request(path, { method: 'GET' })

      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`media storage refused the read: ${response.status}`)
      }

      return Buffer.from(await response.arrayBuffer())
    },
    async delete(path) {
      const response = await request(path, { method: 'DELETE' })

      if (!response.ok && response.status !== 404) {
        throw new Error(`media storage refused the deletion: ${response.status}`)
      }
    },
  }
}

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

/** A local folder with the zone's layout: development and the end-to-end server. */
export function directoryStorage(dir: string): MediaStorage {
  const root = resolve(dir)
  const file = (path: string): string => join(root, checked(path))

  return {
    async put(path, bytes) {
      await mkdir(dirname(file(path)), { recursive: true })
      await writeFile(file(path), bytes)
    },
    async get(path) {
      try {
        return await readFile(file(path))
      } catch (error) {
        if (missing(error)) {
          return null
        }

        throw error
      }
    },
    async delete(path) {
      await unlink(file(path)).catch((error: unknown) => {
        if (!missing(error)) {
          throw error
        }
      })
    },
  }
}

/** The storage the variables name: the bunny zone when its three are set, else the local folder, else none. */
function storageFrom(env: Env): MediaStorage | null {
  if (env.BUNNY_STORAGE_ZONE && env.BUNNY_STORAGE_HOST && env.BUNNY_STORAGE_KEY) {
    return bunnyStorage({ zone: env.BUNNY_STORAGE_ZONE, host: env.BUNNY_STORAGE_HOST, key: env.BUNNY_STORAGE_KEY })
  }

  return env.MEDIA_STORAGE_DIR ? directoryStorage(env.MEDIA_STORAGE_DIR) : null
}

let cached: MediaStorage | null | undefined

/** The configured storage: the bunny zone when its variables are set, else the local folder, else null. */
export function mediaStorage(source?: EnvSource): MediaStorage | null {
  if (!source && cached !== undefined) {
    return cached
  }

  const storage = storageFrom(readEnv(source))

  if (!source) {
    cached = storage
  }

  return storage
}
