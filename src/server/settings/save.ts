import 'server-only'
import type { Pool } from 'pg'
import type { Profile, StoreSettingsInput } from '@/lib/settings/form'
import { type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { updateStoreSettings } from '@/server/dal/settings'
import { updateProfile } from '@/server/dal/users'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** Saves one's own profile and logs what changed as `profile.updated`. */
export async function saveProfile(actor: Actor, profile: Profile, pool: Pool = getPool()): Promise<string[] | null> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const changed = await updateProfile(tx, actor, profile)

    if (changed && changed.length > 0) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'profile.updated', entityType: 'user', entityId: actor.userId, details: { changed }, ipHash: actor.ipHash,
      })
    }

    return changed
  }, pool)
}

/** Saves the store settings and logs what changed as `settings.store_updated`; null when nothing could be saved. */
export async function saveStoreSettings(actor: Actor, input: StoreSettingsInput, pool: Pool = getPool()): Promise<string[] | null> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const changed = await updateStoreSettings(tx, actor.workspaceId, input)

    if (changed && changed.length > 0) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'settings.store_updated', entityType: 'settings', details: { changed }, ipHash: actor.ipHash,
      })
    }

    return changed
  }, pool)
}
