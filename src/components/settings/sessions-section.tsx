'use client'

import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { useReach } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { revokeOtherSessionsAction, revokeSessionAction } from '@/server/actions/security'

type SessionView = { id: string; device: string | null; signedIn: string; lastActive: string; current: boolean }

/** One's signed-in devices: each other one can be signed out, or all of them at once. */
export function SessionsSection({ sessions }: { sessions: SessionView[] }) {
  const t = useTranslations('settings.security.sessions')
  const toast = useToast()
  const send = useReach()
  const [pending, startTransition] = useTransition()
  const others = sessions.filter(session => !session.current).length
  const revoke = (id: string): void => startTransition(async () => {
    const result = await send(() => revokeSessionAction({ id }))
    if (!result) return
    if (result.ok) toast.success(t('revoked'))
    else toast.error(t('failed'))
  })
  const revokeOthers = (): void => startTransition(async () => {
    const result = await send(() => revokeOtherSessionsAction())
    if (!result) return
    if (result.ok) toast.success(t('revokedOthers', { count: result.data.count }))
    else toast.error(t('failed'))
  })
  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="sessions-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t('intro')}</p>
      </div>
      <ul aria-labelledby="sessions-title" className="divide-y rounded-md border">
        {sessions.map(session => {
          const device = session.device ?? t('unknownDevice')
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium break-words">
                  {device}
                  {session.current ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-ink-2">{t('thisDevice')}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">{t('times', { signedIn: session.signedIn, lastActive: session.lastActive })}</p>
              </div>
              {session.current ? null : (
                <Button
                  type="button" variant="outline" size="sm" disabled={pending} aria-label={t('revokeNamed', { device, signedIn: session.signedIn })}
                  onClick={() => revoke(session.id)}
                >
                  {t('revoke')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {others > 0 ? (
        <Button type="button" variant="outline" disabled={pending} onClick={revokeOthers} className="self-start">{t('revokeOthers')}</Button>
      ) : null}
    </section>
  )
}
