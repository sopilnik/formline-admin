'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { failureState, type FormState } from '@/lib/auth-form'
import { setSessionCookie } from '@/server/auth/sessions'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { authConfig } from '@/server/config'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'
import { enterSandbox, type VisitorMeta } from '@/server/sandbox/enter'

async function visitorMeta(): Promise<VisitorMeta> {
  return {
    ipHash: hashIp(await getClientIp(), authConfig().ipHashKey),
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
  redirect('/overview')
}
