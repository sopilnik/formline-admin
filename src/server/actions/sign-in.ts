'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { failureState, formText, type FormState } from '@/lib/auth-form'
import { verifySecondFactor } from '@/server/auth/second-factor'
import { requireSession, setSessionCookie } from '@/server/auth/sessions'
import { signInWithPassword } from '@/server/auth/sign-in'
import { setPreferenceCookies } from '@/server/preferences'
import { getClientIp } from '@/server/request'

export async function signInAction(_previous: FormState<'email'>, form: FormData): Promise<FormState<'email'>> {
  const email = formText(form, 'email')
  const result = await signInWithPassword({
    email,
    password: formText(form, 'password'),
    ip: await getClientIp(),
    userAgent: (await headers()).get('user-agent'),
  })
  if (!result.ok) return failureState(result, { email })
  await setSessionCookie(result.token, result.expiresAt)
  redirect('/sign-in/verify')
}

export async function verifyAction(_previous: FormState<'code'>, form: FormData): Promise<FormState<'code'>> {
  const session = await requireSession({ pending: true })
  if (session.secondFactorVerified) redirect('/overview')
  const result = await verifySecondFactor(session, {
    code: formText(form, 'code'),
    ip: await getClientIp(),
    userAgent: (await headers()).get('user-agent'),
  })
  // The cookie is left as it is even when the factor just got locked: the session
  // row is already gone, so it authenticates nothing, and clearing it here would
  // mutate a cookie inside the action, which re-renders this page server-side and
  // sends requireSession() straight to /sign-in before the locked message shows.
  if (!result.ok) return failureState(result)
  await setSessionCookie(result.token, result.expiresAt)
  await setPreferenceCookies({ locale: result.locale, theme: result.theme })
  redirect('/overview')
}
