'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { FormAlert, UnreachedAlert, useFormAction } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { enterDemoAction } from '@/server/actions/demo'

/** The demo panel at the top of the sign-in card: one button, no sign-up. */
export function DemoEntry({ ended = false }: { ended?: boolean }) {
  const t = useTranslations('demo.entry')
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(enterDemoAction, IDLE as FormState, form)
  return (
    <form ref={form} action={action} className="flex flex-col gap-3 rounded-md border border-border p-4">
      <UnreachedAlert unreached={unreached} />
      <h2 className="text-base font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('body')}</p>
      {ended ? <p role="status" className="text-sm font-medium">{t('ended')}</p> : null}
      <FormAlert state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('pending') : t('button')}
      </Button>
    </form>
  )
}
