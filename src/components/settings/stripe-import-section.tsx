'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { ErrorAlert, UnreachedAlert, useFormAction } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import type { ImportState } from '@/lib/stripe/import'
import { importStripeOrdersAction } from '@/server/actions/stripe'

const IDLE: ImportState = { status: 'idle' }

/** Settings → Store → Store orders: the owner imports the paid store orders the webhook missed. */
export function StripeImportSection({ recent }: { recent: boolean }) {
  const t = useTranslations('settings.store.stripe')
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(importStripeOrdersAction, IDLE, form)
  return (
    <section aria-labelledby="store-orders" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="store-orders" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t('intro')}
          {recent ? null : ` ${t('confirmFirst')}`}
        </p>
      </div>
      {state.status === 'error' ? (
        <ErrorAlert>
          {t(`errors.${state.error}`, { minutes: state.retryAfterMinutes ?? 1 })}
        </ErrorAlert>
      ) : null}
      {state.status === 'done' ? (
        <div role="status" className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm">
          <p>{state.imported.length > 0 ? t('imported', { count: state.imported.length, numbers: state.imported.map(n => `#${n}`).join(', ') }) : t('nothing')}</p>
          {state.already > 0 ? <p className="text-muted-foreground">{t('already', { count: state.already })}</p> : null}
          {state.skipped > 0 ? <p className="text-muted-foreground">{t('skipped', { count: state.skipped })}</p> : null}
          {state.failed > 0 ? <p className="text-muted-foreground">{t('failedSessions', { count: state.failed })}</p> : null}
          {state.more ? <p className="text-muted-foreground">{t('more')}</p> : null}
        </div>
      ) : null}
      {recent ? (
        <form ref={form} action={action}>
          <UnreachedAlert unreached={unreached} />
          <Button type="submit" variant="outline" disabled={pending}>{pending ? t('importing') : t('import')}</Button>
        </form>
      ) : null}
    </section>
  )
}
