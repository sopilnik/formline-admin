'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * The new recovery codes, shown once. Focus moves to the heading, so the change is announced. After setup
 * and recovery the link continues to the dashboard; the security settings close the view in place instead.
 */
export function RecoveryCodesView({ codes, done }: { codes: string[]; done?: { label: string; onClick: () => void } }) {
  const t = useTranslations('auth.recoveryCodes')
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <ol aria-label={t('title')} className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-secondary p-4 font-mono text-sm">
        {codes.map(code => <li key={code}>{code}</li>)}
      </ol>
      {done ? (
        <Button type="button" className="self-start" onClick={done.onClick}>{done.label}</Button>
      ) : (
        <Link href="/overview" className={buttonVariants()}>{t('continue')}</Link>
      )}
    </div>
  )
}
