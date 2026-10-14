'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { TextField } from '@/components/app/form-fields'
import { FormAlert, useErrorText, useFocusOnError } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IDLE, type FormState } from '@/lib/auth-form'
import { switchUserAction } from '@/server/actions/demo'
import type { Member } from '@/server/dal/users'

export type SwitchTarget = Pick<Member, 'id' | 'name' | 'role' | 'hasTotp'>

/** One dialog on every width: the other demo users as a radio list, and the code field for one with an authenticator. */
export function SwitchUserDialog({ open, onOpenChange, members }: { open: boolean; onOpenChange: (open: boolean) => void; members: SwitchTarget[] }) {
  const t = useTranslations('demo.switch')
  const roles = useTranslations('user.roles')
  const [selected, setSelected] = useState<SwitchTarget | null>(null)
  const [state, action, pending] = useActionState(switchUserAction, IDLE as FormState<'code'>)
  const errorText = useErrorText(state)
  useFocusOnError(state, 'switch', 'code')
  const handleOpenChange = (next: boolean): void => {
    onOpenChange(next)
    if (!next) setSelected(null)
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <FormAlert state={state} />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('title')}</legend>
            {members.map(member => (
              <label key={member.id} className="flex items-center gap-3 rounded-md border border-input px-3 py-2 has-checked:border-ring">
                <input
                  type="radio"
                  name="user"
                  value={member.id}
                  // React resets the form after every action result and the browser restores each radio to its
                  // default; a default that follows the state survives that, a controlled `checked` that did not
                  // change is not written back and the chosen user would vanish after a wrong code.
                  defaultChecked={selected?.id === member.id}
                  onChange={() => setSelected(member)}
                  className="size-4 accent-primary"
                />
                <span className="flex-1">
                  <span className="block font-medium">{member.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {roles(member.role)}
                    {member.hasTotp ? ` · ${t('hasCode')}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {selected?.hasTotp ? (
            <TextField id="switch-code" name="code" inputMode="numeric" autoComplete="one-time-code" label={t('code')} hint={t('codeHint')} error={errorText('code')} />
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
            <Button type="submit" disabled={pending || !selected}>{pending ? t('switching') : t('confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
