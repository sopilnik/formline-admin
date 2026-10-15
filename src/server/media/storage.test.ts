import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bunnyStorage, directoryStorage, MEDIA_PATH, mediaPath, mediaStorage, thumbPath } from '@/server/media/storage'

const WS = '3f1c6a2e-9b1d-4e5f-8a7b-0c9d8e7f6a51'
const IMAGE = '0e4d2c1b-7a6f-4e5d-9c8b-1a2b3c4d5e6f'
const PATH = mediaPath(WS, IMAGE)
const zone = { zone: 'formline-admin-media', host: 'storage.bunnycdn.com', key: 'k'.repeat(36) }

type Call = { url: string; method: string; headers: Record<string, string>; body?: Uint8Array }

function fakeFetch(respond: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body as Uint8Array | undefined }

    calls.push(call)

    return respond(call)
  }) as typeof fetch

  return { fetch: impl, calls }
}

describe('media paths', () => {
  it('name an upload by its workspace and image', () => {
    expect(PATH).toBe(`ws/${WS}/${IMAGE}.webp`)
    expect(MEDIA_PATH.test(PATH)).toBe(true)

    for (const bad of ['posters/hush.webp', `ws/${WS}/../x.webp`, `ws/${WS}/${IMAGE}.png`, `/ws/${WS}/${IMAGE}.webp`]) {
      expect(MEDIA_PATH.test(bad), bad).toBe(false)
    }
  })

  it('keep an upload’s small copy beside it', () => {
    expect(thumbPath(PATH)).toBe(`ws/${WS}/${IMAGE}.thumb.webp`)
    expect(MEDIA_PATH.test(thumbPath(PATH))).toBe(true)
    expect(MEDIA_PATH.test(`ws/${WS}/${IMAGE}.thumb.thumb.webp`)).toBe(false)
  })
})

describe('bunnyStorage', () => {
  it('puts the bytes with the access key and their SHA-256 checksum', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 201 }))
    const bytes = Buffer.from('webp bytes')

    await bunnyStorage(zone, fetch).put(PATH, bytes)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`https://storage.bunnycdn.com/formline-admin-media/${PATH}`)
    expect(calls[0]!.method).toBe('PUT')
    expect(calls[0]!.headers).toMatchObject({ AccessKey: zone.key, 'Content-Type': 'application/octet-stream', Checksum: createHash('sha256').update(bytes).digest('hex').toUpperCase() })
    expect(Buffer.from(calls[0]!.body!).toString()).toBe('webp bytes')
  })

  it('reads the bytes, and null for a file that is not there', async () => {
    const { fetch } = fakeFetch(call => (call.url.endsWith(PATH) ? new Response('stored') : new Response(null, { status: 404 })))
    const storage = bunnyStorage(zone, fetch)

    expect((await storage.get(PATH))?.toString()).toBe('stored')
    expect(await storage.get(mediaPath(WS, WS))).toBeNull()
  })

  it('counts a file that is already gone as deleted and throws on any other refusal', async () => {
    expect(await bunnyStorage(zone, fakeFetch(() => new Response(null, { status: 404 })).fetch).delete(PATH)).toBeUndefined()
    await expect(bunnyStorage(zone, fakeFetch(() => new Response(null, { status: 401 })).fetch).delete(PATH)).rejects.toThrow(/401/)
    await expect(bunnyStorage(zone, fakeFetch(() => new Response(null, { status: 500 })).fetch).put(PATH, Buffer.from('x'))).rejects.toThrow(/500/)
  })

  it('never touches a path outside the uploads', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null))

    await expect(bunnyStorage(zone, fetch).delete('posters/hush.webp')).rejects.toThrow(/not a media path/)
    expect(calls).toHaveLength(0)
  })
})

describe('directoryStorage', () => {
  const dirs: string[] = []

  afterAll(async () => Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true }))))

  it('keeps the zone layout in a folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'formline-media-'))

    dirs.push(dir)

    const storage = directoryStorage(dir)

    await storage.put(PATH, Buffer.from('bytes'))

    expect(await readdir(join(dir, 'ws', WS))).toEqual([`${IMAGE}.webp`])
    expect((await storage.get(PATH))?.toString()).toBe('bytes')

    await storage.delete(PATH)
    await storage.delete(PATH)

    expect(await storage.get(PATH)).toBeNull()
    await expect(storage.put('../escape.webp', Buffer.from('x'))).rejects.toThrow(/not a media path/)
  })
})

describe('mediaStorage', () => {
  const base = {
    DATABASE_URL: 'postgres://app:secret@127.0.0.1:56432/formline_dev', IP_HASH_KEY: 'i'.repeat(32), COOKIE_SIGNING_KEY: 'c'.repeat(32),
    TOTP_ENCRYPTION_KEYS: 'k1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  }

  it('is null until a zone or a folder is configured', () => {
    expect(mediaStorage(base)).toBeNull()
    expect(mediaStorage({ ...base, MEDIA_STORAGE_DIR: '/tmp/formline-media' })).not.toBeNull()
    expect(mediaStorage({ ...base, BUNNY_STORAGE_ZONE: zone.zone, BUNNY_STORAGE_HOST: zone.host, BUNNY_STORAGE_KEY: zone.key })).not.toBeNull()
  })
})
