'use client'

import { ImageUp, X } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { ErrorAlert } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { precheckUpload, UPLOAD_ACCEPT } from '@/lib/uploads'
import { cn } from '@/lib/utils'

type Props = { file: File | null; onChange: (file: File | null) => void; disabled?: boolean }

/**
 * The image field of the new-product form (W.9): a file dropped on the frame or chosen with the button, shown as a
 * preview until the product exists — the form sends it then (spec §8.4: no image without a product). The input has no
 * name, so the file never travels in the form's own request.
 */
export function NewProductImage({ file, onChange, disabled = false }: Props) {
  const t = useTranslations('products.new')
  const errors = useTranslations('products.image.errors')
  const labelId = useId()
  const picker = useRef<HTMLInputElement>(null)
  const [refused, setRefused] = useState<'too_large' | 'type' | null>(null)
  const [over, setOver] = useState(false)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  // A refused file is named in the alert and leaves the image chosen before it in place.
  const take = (chosen: File | undefined): void => {
    if (!chosen) return
    const problem = precheckUpload(chosen)
    setRefused(problem)
    if (!problem) onChange(chosen)
  }

  const drop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setOver(false)
    if (!disabled) take(event.dataTransfer.files[0])
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm leading-none font-medium">{t('image')}</span>
      <div
        onDragOver={event => {
          // Always a drop target, so the browser never opens a dropped file itself; while the form is busy it takes none.
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-6 text-center', over && 'border-ring bg-secondary')}
      >
        {file && preview ? (
          <>
            <Image src={preview} alt="" width={160} height={226} unoptimized className="h-auto max-h-40 w-auto max-w-full rounded-md" />
            <span className="max-w-full truncate text-[13px] text-muted-foreground">{file.name}</span>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
              <X aria-hidden />
              {t('imageRemove')}
            </Button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-muted-foreground">{t('imageDrop')}</span>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => picker.current?.click()}>
              <ImageUp aria-hidden />
              {t('imageChoose')}
            </Button>
          </>
        )}
        <input
          ref={picker}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={event => {
            take(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('imageHint')}</p>
      {refused ? <ErrorAlert>{errors(refused)}</ErrorAlert> : null}
    </div>
  )
}
