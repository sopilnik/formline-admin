import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { saveProfile, saveStoreSettings } from '@/server/settings/save'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let other: Actor

async function sandbox(): Promise<Actor> {
  const { workspaceId, userId } = await createSandbox(app)

  return { workspaceId, userId, role: 'owner', ipHash: null }
}

async function member(actor: Actor, role: 'admin' | 'manager'): Promise<Actor> {
  const { rows } = await admin.query<{ id: string }>('select id from fa.users where workspace_id = $1 and role = $2', [actor.workspaceId, role])

  return { ...actor, userId: rows[0]!.id, role }
}

const logged = async (workspaceId: string, action: string) => (await admin.query<{ actor: string; details: { changed: string[] } }>(
  'select actor_user_id as actor, details from fa.activity_log where workspace_id = $1 and action = $2 order by at', [workspaceId, action])).rows

const settingsOf = async (workspaceId: string) => (await admin.query<{ store_name: string; support_email: string; timezone: string; low_stock_default: number }>(
  'select store_name, support_email, timezone, low_stock_default from fa.store_settings where workspace_id = $1', [workspaceId])).rows[0]!

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox()
  other = await sandbox()
})
afterAll(closeAll)

describe('saveProfile', () => {
  it('writes what changed and logs the changed fields', async () => {
    expect(await saveProfile(owner, { name: 'Dana O.', locale: 'ru', theme: 'system', shortcuts: true }, app)).toEqual(['name', 'locale'])

    const { rows } = await admin.query<{ name: string; locale: string; theme: string; shortcuts_enabled: boolean }>(
      'select name, locale, theme, shortcuts_enabled from fa.users where workspace_id = $1 and id = $2', [owner.workspaceId, owner.userId])

    expect(rows[0]).toEqual({ name: 'Dana O.', locale: 'ru', theme: 'system', shortcuts_enabled: true })
    expect(await saveProfile(owner, { name: 'Dana O.', locale: 'ru', theme: 'system', shortcuts: true }, app)).toEqual([])
    expect(await logged(owner.workspaceId, 'profile.updated')).toEqual([{ actor: owner.userId, details: { changed: ['name', 'locale'] } }])
  })

  it('turns the single-key shortcuts off and on again', async () => {
    const shortcuts = async () => (await admin.query<{ on: boolean }>(
      'select shortcuts_enabled as on from fa.users where workspace_id = $1 and id = $2', [owner.workspaceId, owner.userId])).rows[0]!.on

    expect(await saveProfile(owner, { name: 'Dana O.', locale: 'ru', theme: 'system', shortcuts: false }, app)).toEqual(['shortcuts'])
    expect(await shortcuts()).toBe(false)
    expect(await saveProfile(owner, { name: 'Dana O.', locale: 'ru', theme: 'system', shortcuts: true }, app)).toEqual(['shortcuts'])
    expect(await shortcuts()).toBe(true)
  })
})

describe('saveStoreSettings', () => {
  const next = { storeName: 'Formline Berlin', supportEmail: 'help@formline.example', timezone: 'Asia/Almaty', lowStockDefault: 5 }

  it('lets an admin change the store settings and logs the changed fields', async () => {
    const adminActor = await member(owner, 'admin')

    expect(await saveStoreSettings(adminActor, next, app)).toEqual(['storeName', 'supportEmail', 'timezone', 'lowStockDefault'])
    expect(await settingsOf(owner.workspaceId)).toEqual({ store_name: 'Formline Berlin', support_email: 'help@formline.example', timezone: 'Asia/Almaty', low_stock_default: 5 })
    expect(await saveStoreSettings(adminActor, next, app)).toEqual([])
    expect(await logged(owner.workspaceId, 'settings.store_updated')).toEqual([{ actor: adminActor.userId, details: { changed: ['storeName', 'supportEmail', 'timezone', 'lowStockDefault'] } }])
    expect((await settingsOf(other.workspaceId)).store_name).toBe('Formline')
  })

  it('saves nothing for a manager', async () => {
    const manager = await member(owner, 'manager')

    expect(await saveStoreSettings(manager, { ...next, storeName: 'Managed' }, app)).toBeNull()
    expect((await settingsOf(owner.workspaceId)).store_name).toBe('Formline Berlin')
    expect(await logged(owner.workspaceId, 'settings.store_updated')).toHaveLength(1)
  })
})
