'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// A page of the panel failed: the frame stays, the segment offers another try.
// The error itself is logged on the server; the browser receives only its digest.
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations('errors')

  return (
    <div className="flex max-w-md flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p role="alert" className="text-muted-foreground">{t('body')}</p>
      <Button type="button" onClick={() => retry()}>{t('retry')}</Button>
    </div>
  )
}
