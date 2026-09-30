'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { TextField } from '@/components/auth/text-field'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  secret: string
  qr: ReactNode
  error?: string
  /** Inside a card that already carries the title (settings): no box, and the title for screen readers only. */
  bare?: boolean
}

/** A new authenticator: the QR code and the key to type, then its first code (setup, recovery and the security settings). */
export function TotpEnrolment({ id, secret, qr, error, bare = false }: Props) {
  const t = useTranslations('auth')
  return (
    <fieldset className={cn('flex flex-col gap-3', !bare && 'rounded-lg border p-4')}>
      <legend className={bare ? 'sr-only' : 'px-1 text-sm font-medium'}>{t('totp.title')}</legend>
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
