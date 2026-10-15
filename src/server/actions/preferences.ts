'use server'

import { z } from 'zod'
import { LOCALES } from '@/i18n/locale'
import { THEMES } from '@/lib/theme'
import { getSession } from '@/server/auth/sessions'
import { updateSelfPreferences } from '@/server/dal/users'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { setPreferenceCookies } from '@/server/preferences'

/**
 * Theme menu. The cookie drives the server-rendered class; a signed-in user's profile keeps it too. The menu only ever
 * sends one of the themes, so only a crafted call reaches the throw of `parse`: no form state to return it to.
 */
export async function setThemeAction(value: string): Promise<void> {
  const theme = z.enum(THEMES).parse(value)

  await setPreferenceCookies({ theme })

  const session = await getSession()

  if (session?.secondFactorVerified) {
    await withWorkspace(workspaceContext(session), tx => updateSelfPreferences(tx, session, { theme }))
  }
}

/** Language menu, the same way, the throw included. */
export async function setLocaleAction(value: string): Promise<void> {
  const locale = z.enum(LOCALES).parse(value)

  await setPreferenceCookies({ locale })

  const session = await getSession()

  if (session?.secondFactorVerified) {
    await withWorkspace(workspaceContext(session), tx => updateSelfPreferences(tx, session, { locale }))
  }
}
