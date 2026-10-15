'use client'

import { EllipsisVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { useReach } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/lib/team'
import { changeMemberActiveAction, changeMemberRoleAction } from '@/server/actions/team'

type Props = { userId: string; person: string; role: AssignableRole; active: boolean }

/**
 * The actions on another member: a new role at once, deactivating after a confirmation
 * that names them (their sessions end), reactivating at once.
 */
export function MemberActions({ userId, person, role, active }: Props) {
  const t = useTranslations('team.actions')
  const toast = useToast()
  const send = useReach()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const report = (result: { ok: boolean; code?: string }, done: string): void => {
    if (result.ok) toast.success(done)
    else toast.error(result.code === 'forbidden' ? t('notAllowed') : t('failed'))
  }
  const makeRole = (next: AssignableRole): void => startTransition(async () => {
    const result = await send(() => changeMemberRoleAction({ userId, role: next }))

    if (result) report(result, t(`roleChanged.${next}`, { person }))
  })
  const setActive = (next: boolean): void => startTransition(async () => {
    const result = await send(() => changeMemberActiveAction({ userId, active: next }))

    if (!result) return
    setConfirming(false)
    report(result, next ? t('reactivated', { person }) : t('deactivated', { person }))
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={t('label', { person })} />}>
          <EllipsisVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {active ? (
            <>
              {ASSIGNABLE_ROLES.filter(option => option !== role).map(option => (
                <DropdownMenuItem key={option} onClick={() => makeRole(option)}>{t(`makeRole.${option}`)}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>{t('deactivate')}</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => setActive(true)}>{t('reactivate')}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle', { person })}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => setActive(false)}>{pending ? t('deactivating') : t('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
