'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { TextField } from '@/components/auth/text-field'

/** A new authenticator: the QR code and the key to type, then its first code (setup and recovery). */
export function TotpEnrolment({ id, secret, qr, error }: { id: string; secret: string; qr: ReactNode; error?: string }) {
  const t = useTranslations('auth')
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{t('totp.title')}</legend>
      <p className="text-sm text-muted-foreground">{t('totp.intro')}</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {qr}
        <div className="flex min-w-0 flex-col gap-1 self-stretch">
          <p className="text-sm font-medium">{t('totp.key')}</p>
          <code id="totp-secret" className="font-mono text-sm break-all">{secret}</code>
        </div>
      </div>
      <input type="hidden" name="totpSecret" value={secret} />
      <TextField id={id} name="code" inputMode="numeric" autoComplete="one-time-code" label={t('fields.code')} error={error} />
    </fieldset>
  )
}
