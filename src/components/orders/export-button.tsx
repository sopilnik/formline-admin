'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Fetches the CSV and hands it to the browser as a download (spec §8.2): a fetch rather than a
 * plain link, so a refused export (the rate limit) becomes a message instead of a failed download.
 */
export function ExportButton({ href, label, size = 'default' }: { href: string; label: string; size?: 'default' | 'sm' }) {
  const t = useTranslations('orders.export')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const run = (): void => startTransition(async () => {
    const response = await fetch(href, { cache: 'no-store' })
    if (response.status === 429) {
      toast.error(t('rateLimited', { seconds: Number(response.headers.get('Retry-After') ?? 60) }))
      return
    }
    if (!response.ok) {
      toast.error(t('failed'))
      return
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'orders.csv'
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
    if (response.headers.get('X-Export-Truncated') === 'true') toast.success(t('truncated', { count: 10_000 }))
  })
  return (
    <Button type="button" variant="outline" size={size} disabled={pending} onClick={run}>
      <Download aria-hidden />
      {pending ? t('pending') : label}
    </Button>
  )
}
