'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { failureState, formText, type FormState } from '@/lib/auth-form'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { requestIpHash } from '@/server/actor'
import { requireSession, setSessionCookie } from '@/server/auth/sessions'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { cleanupExpiredSandboxes } from '@/server/sandbox/cleanup'
import { enterSandbox, type VisitorMeta } from '@/server/sandbox/enter'
import { resetSandbox } from '@/server/sandbox/lifecycle'
import { switchUser } from '@/server/sandbox/sign-in-as'

async function visitorMeta(): Promise<VisitorMeta> {
  return {
    ipHash: await requestIpHash(),
    userAgentSummary: summariseUserAgent((await headers()).get('user-agent')),
    locale: await getLocale(),
  }
}

/** "Enter the demo": a new sandbox and its session, then the overview (spec §6.4). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this signature; the demo needs neither argument
export async function enterDemoAction(_previous: FormState, _form: FormData): Promise<FormState> {
  const entry = await enterSandbox(await visitorMeta())
  if (!entry.ok) return failureState(entry)
  await setSessionCookie(entry.token, entry.expiresAt, { demo: true })
  after(() => cleanupExpiredSandboxes())
  redirect('/overview')
}

/** "Reset data": a fresh copy and a new session for the same visitor (spec §6.4). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this signature; the reset needs neither argument
export async function resetDemoAction(_previous: FormState, _form: FormData): Promise<FormState> {
  const session = await requireSession()
  if (session.workspaceKind !== 'sandbox') redirect('/overview')
  const entry = await resetSandbox(session, await visitorMeta())
  if (!entry.ok) return failureState(entry)
  await setSessionCookie(entry.token, entry.expiresAt, { demo: true })
  redirect('/overview')
}

/** "Switch user": continue as another demo user of the same sandbox (spec §6.4). */
export async function switchUserAction(_previous: FormState<'code'>, form: FormData): Promise<FormState<'code'>> {
  const session = await requireSession()
  if (session.workspaceKind !== 'sandbox') redirect('/overview')
  const target = z.uuid().safeParse(formText(form, 'user'))
  if (!target.success) return { status: 'error', error: 'generic' }
  const meta = await visitorMeta()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  const result = await switchUser(session, {
    targetUserId: target.data, code: formText(form, 'code'), userAgentSummary: meta.userAgentSummary, ipHash: meta.ipHash,
    preferences: { locale: meta.locale, theme },
  })
  if (!result.ok) return failureState(result)
  await setSessionCookie(result.token, result.expiresAt, { demo: true })
  redirect('/overview')
}
