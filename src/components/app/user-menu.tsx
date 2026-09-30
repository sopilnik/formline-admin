'use client'

import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSignOut } from '@/components/app/sign-out'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { WorkspaceKind } from '@/server/authz/matrix'
import type { Role } from '@/server/db/with-workspace'

export type FrameUser = { name: string; role: Role; kind: WorkspaceKind }

export function UserMenu({ user }: { user: FrameUser }) {
  const t = useTranslations('user')
  const signOut = useSignOut()
  const role = t(`roles.${user.role}`)
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
  return (
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
        <DropdownMenuItem disabled={signOut.pending} onClick={signOut.request}>
          <LogOut aria-hidden />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
