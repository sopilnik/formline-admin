'use server'

import { cookies, headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { failureState, type FormState } from '@/lib/auth-form'
import { formText } from '@/lib/form'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { setSessionCookie } from '@/server/auth/sessions'
import { setupOwner, type SetupField } from '@/server/auth/setup'
import { getClientIp } from '@/server/request'

export async function setupAction(_previous: FormState<SetupField>, form: FormData): Promise<FormState<SetupField>> {
  const result = await setupOwner({
    token: formText(form, 'token'),
    name: formText(form, 'name'),
    email: formText(form, 'email'),
    password: formText(form, 'password'),
    totpSecret: formText(form, 'totpSecret'),
    code: formText(form, 'code'),
    ip: await getClientIp(),
    userAgent: (await headers()).get('user-agent'),
    locale: await getLocale(),
    theme: parseTheme((await cookies()).get(THEME_COOKIE)?.value),
  })

  // The token and the password are never sent back into the form.
  if (!result.ok) {
    return failureState(result, { name: formText(form, 'name'), email: formText(form, 'email') })
  }

  await setSessionCookie(result.token, result.expiresAt)

  return { status: 'done', recoveryCodes: result.recoveryCodes }
}
