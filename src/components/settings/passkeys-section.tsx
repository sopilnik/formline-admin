'use client'

import { startRegistration } from '@simplewebauthn/browser'
import { FingerprintPattern } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { TextField } from '@/components/app/form-fields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { PASSKEY_NAME_MAX } from '@/lib/passkeys'
import { beginPasskeyRegistrationAction, finishPasskeyRegistrationAction, removePasskeyAction, renamePasskeyAction } from '@/server/actions/passkeys'

export type PasskeyView = { id: string; name: string; added: string; lastUsed: string | null }

type Props = { available: boolean; recent: boolean; passkeys: PasskeyView[] }

/** The owner's passkeys (spec §5.3); adding and removing wait until the owner has confirmed it is them, at the top of the page. */
export function PasskeysSection({ available, recent, passkeys }: Props) {
  const t = useTranslations('settings.security.passkeys')
  const errors = useTranslations('auth.errors')
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  async function add() {
    setAdding(true)
    try {
      const begun = await beginPasskeyRegistrationAction()
      if (!begun.ok) {
        toast.error(errors(begun.error, { minutes: 1 }))
        return
      }
      const finished = await finishPasskeyRegistrationAction(await startRegistration({ optionsJSON: begun.options }))
      if (finished.ok) toast.success(t('addedToast'))
      else toast.error(errors(finished.error, { minutes: 1 }))
    } catch {
      // The browser dialog was cancelled, or the authenticator refused.
      toast.error(errors('passkey_cancelled'))
    } finally {
      setAdding(false)
    }
  }

  if (!available) {
    return (
      <section aria-labelledby="passkeys-title" className="rounded-lg border bg-card p-5">
        <h2 id="passkeys-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t('sandbox')}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="passkeys-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="passkeys-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t('intro')}</p>
      </div>
      {passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul aria-labelledby="passkeys-title" className="divide-y rounded-md border">
          {passkeys.map(passkey => <PasskeyItem key={passkey.id} passkey={passkey} canRemove={recent} />)}
        </ul>
      )}
      <Button type="button" onClick={add} disabled={!recent || adding} className="self-start">
        <FingerprintPattern aria-hidden />
        {adding ? t('adding') : t('add')}
      </Button>
    </section>
  )
}

function PasskeyItem({ passkey, canRemove }: { passkey: PasskeyView; canRemove: boolean }) {
  const t = useTranslations('settings.security.passkeys')
  const errors = useTranslations('auth.errors')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)

  function rename(form: FormData) {
    startTransition(async () => {
      const result = await renamePasskeyAction(passkey.id, String(form.get('name') ?? ''))
      if (!result.ok) {
        toast.error(errors(result.error, { minutes: 1 }))
        return
      }
      setRenaming(false)
      toast.success(t('renamedToast'))
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await removePasskeyAction(passkey.id)
      setRemoving(false)
      if (result.ok) toast.success(t('removedToast'))
      else toast.error(errors(result.error, { minutes: 1 }))
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-48 flex-1">
        <p className="font-medium break-words">{passkey.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('added', { date: passkey.added })} · {passkey.lastUsed ? t('lastUsed', { date: passkey.lastUsed }) : t('neverUsed')}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Dialog open={renaming} onOpenChange={setRenaming}>
          <DialogTrigger render={<Button variant="outline" size="sm" aria-label={t('renameNamed', { name: passkey.name })} />}>
            {t('rename')}
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t('rename')}</DialogTitle>
            </DialogHeader>
            <form action={rename} className="flex flex-col gap-4">
              <TextField id={`passkey-name-${passkey.id}`} name="name" label={t('renameLabel')} defaultValue={passkey.name} maxLength={PASSKEY_NAME_MAX} />
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
                <Button type="submit" disabled={pending}>{t('save')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={removing} onOpenChange={setRemoving}>
          <DialogTrigger render={<Button variant="outline" size="sm" disabled={!canRemove} aria-label={t('removeNamed', { name: passkey.name })} />}>
            {t('remove')}
          </DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t('removeTitle', { name: passkey.name })}</DialogTitle>
              <DialogDescription>{t('removeBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
              <Button type="button" variant="destructive" onClick={remove} disabled={pending}>{t('remove')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </li>
  )
}
