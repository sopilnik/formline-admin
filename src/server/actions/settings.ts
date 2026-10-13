'use server'

import { refresh } from 'next/cache'
import { formText } from '@/lib/form'
import { PROFILE_FIELDS, STORE_FIELDS, type ProfileField, type ProfileIssue, type StoreField, type StoreIssue } from '@/lib/settings/fields'
import { parseProfile, parseStoreSettings } from '@/lib/settings/form'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { setPreferenceCookies } from '@/server/preferences'
import { saveProfile, saveStoreSettings } from '@/server/settings/save'

export type ProfileState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'forbidden' | 'failed'; fieldErrors: Partial<Record<ProfileField, ProfileIssue>>; values: Record<ProfileField, string> }
  /** `count` tells one save from the next. */
  | { status: 'done'; count: number }

/** Settings → Profile: the name, and the language and theme the menus in the top bar also set. */
export async function saveProfileAction(previous: ProfileState, form: FormData): Promise<ProfileState> {
  const session = await requireSession()
  const values = Object.fromEntries(PROFILE_FIELDS.map(field => [field, formText(form, field)])) as Record<ProfileField, string>
  if (!can(session.role, 'self.manage', session.workspaceKind)) return { status: 'error', error: 'forbidden', fieldErrors: {}, values }
  const parsed = parseProfile(values)
  if (!parsed.ok) return { status: 'error', error: 'invalid', fieldErrors: parsed.fieldErrors, values }
  const changed = await saveProfile(await actorOf(session), parsed.data)
  if (!changed) return { status: 'error', error: 'failed', fieldErrors: {}, values }
  // The server renders the language and the theme from these cookies.
  await setPreferenceCookies({ locale: parsed.data.locale, theme: parsed.data.theme })
  refresh()
  return { status: 'done', count: previous.status === 'done' ? previous.count + 1 : 1 }
}

export type StoreSettingsState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'forbidden' | 'failed'; fieldErrors: Partial<Record<StoreField, StoreIssue>>; values: Record<StoreField, string> }
  | { status: 'done'; count: number }

/** Settings → Store: owners and admins. */
export async function saveStoreSettingsAction(previous: StoreSettingsState, form: FormData): Promise<StoreSettingsState> {
  const session = await requireSession()
  const values = Object.fromEntries(STORE_FIELDS.map(field => [field, formText(form, field)])) as Record<StoreField, string>
  if (!can(session.role, 'settings.store', session.workspaceKind)) return { status: 'error', error: 'forbidden', fieldErrors: {}, values }
  const parsed = parseStoreSettings(values)
  if (!parsed.ok) return { status: 'error', error: 'invalid', fieldErrors: parsed.fieldErrors, values }
  const changed = await saveStoreSettings(await actorOf(session), parsed.data)
  if (!changed) return { status: 'error', error: 'failed', fieldErrors: {}, values }
  refresh()
  return { status: 'done', count: previous.status === 'done' ? previous.count + 1 : 1 }
}
