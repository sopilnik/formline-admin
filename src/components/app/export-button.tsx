'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type Props = {
  href: string
  label: string
  size?: 'default' | 'sm'
  /** The list's own words ("The export failed", "The file holds the first 10,000 orders"); the keys read the same. */
  namespace: 'orders.export' | 'customers.export'
  /** The most rows a file holds, named when the server cut the file there. */
  cap: number
}

/** The response, or null when the connection failed before one came. */
async function fetchFile(href: string): Promise<{ response: Response; file: Blob } | null> {
  try {
    const response = await fetch(href, { cache: 'no-store' })

    return { response, file: response.ok ? await response.blob() : new Blob() }
  } catch {
    return null
  }
}

/**
 * Fetches the CSV and hands it to the browser as a download: a fetch rather than a
 * plain link, so a refused export (the rate limit) or a dropped connection becomes a message instead of a failed download.
 * Not a transition: an async transition would hold every navigation until the file had come.
 */
export function ExportButton({ href, label, size = 'default', namespace, cap }: Props) {
  const t = useTranslations(namespace)
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const run = async (): Promise<void> => {
    setPending(true)

    const fetched = await fetchFile(href)

    setPending(false)

    if (!fetched) {
      toast.error(t('failed'))

      return
    }

    const { response, file } = fetched

    if (response.status === 429) {
      toast.error(t('rateLimited', { seconds: Number(response.headers.get('Retry-After') ?? 60) }))

      return
    }
    if (!response.ok) {
      toast.error(t('failed'))

      return
    }

    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `${namespace.split('.')[0]}.csv`
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')

    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)

    if (response.headers.get('X-Export-Truncated') === 'true') {
      toast.success(t('truncated', { count: cap }))
    }
  }

  return (
    <Button type="button" variant="outline" size={size} disabled={pending} onClick={run}>
      <Download aria-hidden />
      {pending ? t('pending') : label}
    </Button>
  )
}
