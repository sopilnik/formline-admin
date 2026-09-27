'use client'

import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { SwitchUserDialog, type SwitchTarget } from '@/components/app/switch-user'
import { FormAlert } from '@/components/auth/form-parts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IDLE, type FormState } from '@/lib/auth-form'
import { resetDemoAction } from '@/server/actions/demo'

/**
 * The strip under the top bar of every sandbox page (spec §6.4, §11): the rule,
 * "Reset data" behind a confirmation, "Switch user" and at phone width one
 * overflow menu that holds the actions.
 */
export function DemoBanner({ hours, members }: { hours: number; members: SwitchTarget[] }) {
  const t = useTranslations('demo.banner')
  const [resetOpen, setResetOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [state, action, pending] = useActionState(resetDemoAction, IDLE as FormState)
  return (
    <div role="region" aria-label={t('label')} className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 text-sm md:px-6">
      <p className="min-w-0 flex-1 truncate sm:whitespace-normal">
        <strong className="font-semibold">{t('title')}</strong> {t('body', { hours })}
      </p>
      <div className="hidden items-center gap-2 sm:flex">
        <Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(true)}>{t('reset')}</Button>
        {members.length > 0 ? <Button type="button" variant="outline" size="sm" onClick={() => setSwitchOpen(true)}>{t('switch')}</Button> : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="sm:hidden" aria-label={t('more')} />}>
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setResetOpen(true)}>{t('reset')}</DropdownMenuItem>
          {members.length > 0 ? <DropdownMenuItem onClick={() => setSwitchOpen(true)}>{t('switch')}</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('resetTitle')}</DialogTitle>
            <DialogDescription>{t('resetBody')}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            <FormAlert state={state} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
              <Button type="submit" disabled={pending}>{pending ? t('resetting') : t('resetConfirm')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SwitchUserDialog open={switchOpen} onOpenChange={setSwitchOpen} members={members} />
    </div>
  )
}
