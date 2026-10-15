'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { failureState, type FormState } from '@/lib/auth-form'
import { formText } from '@/lib/form'
import { reauthenticate, type ReauthField } from '@/server/auth/reauth'
import { clearSessionCookie, requireSession, setSessionCookie } from '@/server/auth/sessions'
import { getClientIp } from '@/server/request'

export async function reauthAction(_previous: FormState<ReauthField>, form: FormData): Promise<FormState<ReauthField>> {
  const session = await requireSession()
  const result = await reauthenticate(session, {
    password: formText(form, 'password'),
    code: formText(form, 'code'),
    ip: await getClientIp(),
    userAgent: (await headers()).get('user-agent'),
  })

  if (!result.ok) {
    // A locked second factor has ended the session already.
    if (result.error === 'second_factor_locked') {
      await clearSessionCookie()
      redirect('/sign-in')
    }

    return failureState(result)
  }
  await setSessionCookie(result.token, result.expiresAt)

  return { status: 'done' }
}
