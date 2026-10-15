import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { createCollectionWithLog, deleteCollectionWithLog, moveCollectionWithLog, updateCollectionWithLog } from '@/server/collections/write'
import { COLLECTION_CAP, createCollection, getCollection, listCollections } from '@/server/dal/collections'
import { withWorkspace } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, gate, lockWaiter } from './fixtures'

let admin: pg.Pool
let app: pg.Pool

async function sandbox(): Promise<Actor> {
  const { workspaceId, userId } = await createSandbox(app)

  return { workspaceId, userId, role: 'owner', ipHash: null }
}

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(closeAll)

const list = (actor: Actor) => withWorkspace(actor, tx => listCollections(tx, actor.workspaceId), app)
const order = async (actor: Actor) => (await list(actor)).map(c => `${c.position}:${c.slug}`)
const idOf = async (actor: Actor, slug: string) => (await list(actor)).find(c => c.slug === slug)!.id

describe('collections', () => {
  it('lists the collections in order with their product counts, and one with its products', async () => {
    const owner = await sandbox()
    const rows = await list(owner)

    expect(rows.map(r => r.slug)).toEqual(['monochrome', 'primary', 'pastel', 'night'])
    expect(rows.map(r => r.products)).toEqual([4, 4, 4, 4])

    const night = (await withWorkspace(owner, tx => getCollection(tx, owner.workspaceId, 'night'), app))!

    expect(night.products.map(p => p.slug)).toEqual(['after-dark', 'far-orbit', 'hush', 'night-blocks'])
    expect(night.products[0]!.image?.storagePath).toBe('posters/after-dark.webp')
  })

  it('adds a collection at the end, saves its fields and refuses a slug in use', async () => {
    const owner = await sandbox()
    const created = await createCollectionWithLog(owner, { name: 'Deep Sea', slug: 'deep-sea', description: '' }, app)

    expect(created).toMatchObject({ ok: true, slug: 'deep-sea' })
    expect(await order(owner)).toEqual(['1:monochrome', '2:primary', '3:pastel', '4:night', '5:deep-sea'])
    expect(await createCollectionWithLog(owner, { name: 'Night again', slug: 'night', description: '' }, app)).toEqual({ ok: false, reason: 'slug_taken' })

    const id = await idOf(owner, 'deep-sea')

    expect(await updateCollectionWithLog(owner, { id, name: 'Deeper Sea', slug: 'deeper-sea', description: 'Blue.' }, app))
      .toEqual({ ok: true, id, slug: 'deeper-sea', previousSlug: 'deep-sea' })
    expect(await updateCollectionWithLog(owner, { id, name: 'Deeper Sea', slug: 'pastel', description: '' }, app)).toEqual({ ok: false, reason: 'slug_taken' })

    const log = await admin.query<{ action: string }>('select action from fa.activity_log where workspace_id = $1 and entity_id = $2 order by at, id', [owner.workspaceId, id])

    expect(log.rows.map(r => r.action)).toEqual(['collection.created', 'collection.updated'])
  })

  it('moves a collection one place and stays put at either end', async () => {
    const owner = await sandbox()
    const pastel = await idOf(owner, 'pastel')

    expect(await moveCollectionWithLog(owner, { id: pastel, direction: 'up' }, app)).toEqual({ ok: true, slug: 'pastel', from: 3, to: 2, of: 4 })
    expect(await order(owner)).toEqual(['1:monochrome', '2:pastel', '3:primary', '4:night'])

    const monochrome = await idOf(owner, 'monochrome')

    expect(await moveCollectionWithLog(owner, { id: monochrome, direction: 'up' }, app)).toEqual({ ok: true, slug: 'monochrome', from: 1, to: 1, of: 4 })

    const moves = await admin.query<{ details: unknown }>("select details from fa.activity_log where workspace_id = $1 and action = 'collection.moved'", [owner.workspaceId])

    expect(moves.rows).toEqual([{ details: { slug: 'pastel', from: 3, to: 2 } }])
  })

  it('deletes an empty collection only, and closes the gap', async () => {
    const owner = await sandbox()

    expect(await deleteCollectionWithLog(owner, await idOf(owner, 'primary'), app)).toEqual({ ok: false, reason: 'not_empty' })
    await admin.query("update fa.products set collection_id = (select id from fa.collections where workspace_id = $1 and slug = 'night') where workspace_id = $1 and collection_id = (select id from fa.collections where workspace_id = $1 and slug = 'primary')", [owner.workspaceId])
    expect(await deleteCollectionWithLog(owner, await idOf(owner, 'primary'), app)).toEqual({ ok: true, slug: 'primary', name: 'Primary' })
    expect(await order(owner)).toEqual(['1:monochrome', '2:pastel', '3:night'])
  })

  it('stops at the collection cap and refuses a viewer', async () => {
    const owner = await sandbox()

    await admin.query("insert into fa.collections (workspace_id, slug, name, position) select $1, 'filler-' || n, 'Filler ' || n, 10 + n from generate_series(1, $2::int) n", [owner.workspaceId, COLLECTION_CAP - 4])
    expect(await createCollectionWithLog(owner, { name: 'One more', slug: 'one-more', description: '' }, app)).toEqual({ ok: false, reason: 'cap' })

    const viewerId = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])).rows[0]!.id
    const viewer: Actor = { ...owner, userId: viewerId, role: 'viewer' }

    expect(await moveCollectionWithLog(viewer, { id: await idOf(owner, 'night'), direction: 'up' }, app)).toEqual({ ok: false, reason: 'not_found' })
    expect(await updateCollectionWithLog(viewer, { id: await idOf(owner, 'night'), name: 'Viewer', slug: 'night', description: '' }, app)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('lets only one of two concurrent creates take the last place under the cap', async () => {
    const owner = await sandbox()

    try {
      await admin.query("insert into fa.collections (workspace_id, slug, name, position) select $1, 'filler-' || n, 'Filler ' || n, 10 + n from generate_series(1, $2::int) n", [owner.workspaceId, COLLECTION_CAP - 5])

      const inserted = gate()
      const done = gate()
      const first = withWorkspace(owner, async tx => {
        const made = await createCollection(tx, owner.workspaceId, { name: 'First', slug: 'first', description: '' })

        inserted.open()
        await done.wait

        return made
      }, app)

      await inserted.wait

      const second = createCollectionWithLog(owner, { name: 'Second', slug: 'second', description: '' }, app)

      await Promise.race([lockWaiter(admin), second.catch(() => undefined)])
      done.open()

      expect(await first).toMatchObject({ ok: true, slug: 'first' })
      expect(await second).toEqual({ ok: false, reason: 'cap' })
      expect(await list(owner)).toHaveLength(COLLECTION_CAP)
    } finally {
      await admin.query('delete from fa.workspaces where id = $1', [owner.workspaceId])
    }
  })
})
