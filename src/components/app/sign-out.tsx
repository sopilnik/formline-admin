'use client'

import { useTranslations } from 'next-intl'
import { createContext, use, useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { signOutAction } from '@/server/actions/session'
import type { WorkspaceKind } from '@/server/authz/matrix'

type SignOut = { request: () => void; pending: boolean }

const SignOutContext = createContext<SignOut | null>(null)

/**
 * Signing out, for the account menu and the command palette alike. In a sandbox it asks first: signing out ends the
 * demo and deletes the sandbox.
 */
export function SignOutProvider({ kind, children }: { kind: WorkspaceKind; children: ReactNode }) {
  const t = useTranslations('user')
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const signOut = () => startTransition(async () => { await signOutAction() })
  const request = () => (kind === 'sandbox' ? setConfirm(true) : signOut())
  return (
    <SignOutContext value={{ request, pending }}>
      {children}
      {kind === 'sandbox' ? (
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
    </SignOutContext>
  )
}

export function useSignOut(): SignOut {
  const value = use(SignOutContext)
  if (!value) throw new Error('useSignOut needs a SignOutProvider above it')
  return value
}
