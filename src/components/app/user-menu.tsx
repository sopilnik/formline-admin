'use client'

import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { signOutAction } from '@/server/actions/session'
import type { WorkspaceKind } from '@/server/authz/matrix'
import type { Role } from '@/server/db/with-workspace'

export type FrameUser = { name: string; role: Role; kind: WorkspaceKind }

export function UserMenu({ user }: { user: FrameUser }) {
  const t = useTranslations('user')
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const role = t(`roles.${user.role}`)
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
  const signOut = () => startTransition(async () => { await signOutAction() })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto gap-2 px-1.5 py-1" aria-label={t('menu', { name: user.name, role })} />}>
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-selected text-xs font-semibold text-selected-foreground">
            {initials}
          </span>
          <span className="hidden text-left text-[13px] leading-tight sm:block">
            <span className="block">{user.name}</span>
            <span className="block text-xs text-muted-foreground">{role}</span>
          </span>
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href="/settings/security" />}>
            <KeyRound aria-hidden />
            {t('security')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onClick={() => (user.kind === 'sandbox' ? setConfirm(true) : signOut())}>
            <LogOut aria-hidden />
            {t('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {user.kind === 'sandbox' ? (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t('endDemoTitle')}</DialogTitle>
              <DialogDescription>{t('endDemoBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
              <Button type="button" disabled={pending} onClick={signOut}>{t('signOut')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
