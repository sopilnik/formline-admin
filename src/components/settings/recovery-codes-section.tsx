'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { FormAlert } from '@/components/app/form-parts'
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IDLE, type FormState } from '@/lib/auth-form'
import { regenerateRecoveryCodesAction } from '@/server/actions/security'

/** Recovery codes: how many are left, and ten new ones in place of the old, shown once. */
export function RecoveryCodesSection({ remaining, hasFactor, recent }: { remaining: number; hasFactor: boolean; recent: boolean }) {
  const t = useTranslations('settings.security.recoveryCodes')
  const [confirming, setConfirming] = useState(false)
  const [state, action, pending] = useActionState(regenerateRecoveryCodesAction, IDLE as FormState)
  const [closed, setClosed] = useState<FormState | null>(null)
  const codes = state.status === 'done' && state !== closed ? state.recoveryCodes : undefined
  return (
    <section aria-labelledby="recovery-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="recovery-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">
          {hasFactor ? t('remaining', { count: remaining }) : t('noFactor')}
          {hasFactor && !recent ? ` ${t('confirmFirst')}` : null}
        </p>
      </div>
      {codes ? <RecoveryCodesView codes={codes} done={{ label: t('done'), onClick: () => setClosed(state) }} /> : null}
      {hasFactor && recent && !codes ? (
        <>
          <FormAlert state={state} />
          <Button type="button" variant="outline" className="self-start" disabled={pending} onClick={() => setConfirming(true)}>
            {pending ? t('making') : t('make')}
          </Button>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>{t('confirmTitle')}</DialogTitle>
                <DialogDescription>{t('confirmBody')}</DialogDescription>
              </DialogHeader>
              <form action={action} onSubmit={() => setConfirming(false)}>
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
                  <Button type="submit" disabled={pending}>{t('confirm')}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </section>
  )
}
