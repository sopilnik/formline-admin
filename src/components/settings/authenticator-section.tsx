'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useState, useTransition, type ReactNode } from 'react'
import { FormAlert, useErrorText, useFocusOnError } from '@/components/app/form-parts'
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view'
import { TotpEnrolment } from '@/components/auth/totp-enrolment'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { IDLE, type FormState } from '@/lib/auth-form'
import { disableTotpAction, enableTotpAction } from '@/server/actions/security'

type Props = {
  enabled: boolean
  recent: boolean
  /** Whether turning it off leaves a second factor: in the owner workspace a passkey must remain (spec §5.3). */
  canDisable: boolean
  /** The new key for an enrolment, made on the server for this page view. */
  secret: string
  qr: ReactNode
}

/**
 * The authenticator app (spec §5.3, §8.8): turn it on with the key and the first code, replace it the same way, or turn it
 * off while another factor remains. A first authenticator comes with ten recovery codes, shown once.
 */
export function AuthenticatorSection({ enabled, recent, canDisable, secret, qr }: Props) {
  const t = useTranslations('settings.security.authenticator')
  const errors = useTranslations('auth.errors')
  const toast = useToast()

  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [state, action, submitting] = useActionState(enableTotpAction, IDLE as FormState<'code'>)

  // The results decide what shows, without an effect: "Replace" remembers the result it was opened after and stays open
  // until a new success; the codes of a success show until they are closed.
  const [replacingAfter, setReplacingAfter] = useState<FormState<'code'> | null>(null)
  const [closed, setClosed] = useState<FormState<'code'> | null>(null)
  // A form opened after a result does not show that result's error, whether it is the Replace form or the Off form that
  // appears after "Turn off"; an error from a submit inside it is a new state.
  const shown = state === replacingAfter || state === closed ? (IDLE as FormState<'code'>) : state
  const errorFor = useErrorText(shown)
  useFocusOnError(state, 'totp', 'code')

  const settle = useEffectEvent((result: FormState<'code'>) => {
    if (result.status === 'done') toast.success(result.recoveryCodes ? t('enabled') : t('replaced'))
  })
  useEffect(() => settle(state), [state])

  const disable = (): void => startTransition(async () => {
    const result = await disableTotpAction()
    setConfirming(false)
    if (result.ok) {
      setClosed(state)
      setReplacingAfter(null)
      toast.success(t('disabled'))
    } else toast.error(errors(result.error, { minutes: 1 }))
  })

  const replacing = replacingAfter !== null && (state === replacingAfter || state.status === 'error')
  const enrolling = !enabled || replacing
  const codes = state.status === 'done' && state !== closed ? state.recoveryCodes : undefined

  return (
    <section aria-labelledby="authenticator-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="authenticator-title" className="flex flex-wrap items-center gap-2 font-sans text-[15px] font-semibold">
          {t('title')}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-ink-2">{enabled ? t('on') : t('off')}</span>
        </h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{recent ? (enabled ? t('introOn') : t('introOff')) : t('confirmFirst')}</p>
      </div>
      {codes ? <RecoveryCodesView codes={codes} done={{ label: t('codesDone'), onClick: () => setClosed(state) }} /> : null}
      {recent && !codes && enrolling ? (
        <form action={action} noValidate className="flex max-w-xl flex-col gap-4">
          <FormAlert state={shown} />
          <TotpEnrolment id="totp-code" secret={secret} qr={qr} error={errorFor('code')} bare />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting}>{submitting ? t('saving') : enabled ? t('replace') : t('enable')}</Button>
            {enabled ? <Button type="button" variant="outline" onClick={() => setReplacingAfter(null)}>{t('cancel')}</Button> : null}
          </div>
        </form>
      ) : null}
      {recent && enabled && !codes && !enrolling ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setReplacingAfter(state)}>{t('replaceStart')}</Button>
            <Button type="button" variant="outline" disabled={!canDisable || pending} onClick={() => setConfirming(true)}>{t('disable')}</Button>
          </div>
          {canDisable ? null : <p className="text-[13px] text-muted-foreground">{t('lastFactor')}</p>}
        </div>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('disableTitle')}</DialogTitle>
            <DialogDescription>{t('disableBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={disable}>{t('disableConfirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
