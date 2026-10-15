'use server'

import { headers } from 'next/headers'
import { failureState, type FormState } from '@/lib/auth-form'
import { formText } from '@/lib/form'
import { recoverOwner, type RecoverField } from '@/server/auth/recovery'
import { setSessionCookie } from '@/server/auth/sessions'
import { getClientIp } from '@/server/request'

export async function recoverAction(_previous: FormState<RecoverField>, form: FormData): Promise<FormState<RecoverField>> {
  const result = await recoverOwner({
    recoveryCode: formText(form, 'recoveryCode'),
    password: formText(form, 'password'),
    totpSecret: formText(form, 'totpSecret'),
    code: formText(form, 'code'),
    ip: await getClientIp(),
    userAgent: (await headers()).get('user-agent'),
  })

  if (!result.ok) return failureState(result)
  await setSessionCookie(result.token, result.expiresAt)

  return { status: 'done', recoveryCodes: result.recoveryCodes }
}
