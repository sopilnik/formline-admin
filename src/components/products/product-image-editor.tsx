'use client'

import { ImageUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition, type ChangeEvent } from 'react'
import { ProductImage } from '@/components/products/product-image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, type UploadError } from '@/lib/uploads'
import { removeProductImageAction } from '@/server/actions/products'

type Props = { productId: string; name: string; src: string | null; width: number; height: number }
type Problem = { error: Exclude<UploadError, 'rate_limited'> } | { error: 'rate_limited'; minutes: number }

/**
 * The image of the product page for a role that may change it (spec §8.4). The file goes to
 * `POST /api/media` as the request body; the picker refuses what could never pass, the server
 * decides the rest. Removing asks first, as every deletion does (spec §11).
 */
export function ProductImageEditor({ productId, name, src, width, height }: Props) {
  const t = useTranslations('products.image')
  const toast = useToast()
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [uploading, startUpload] = useTransition()
  const [removing, startRemove] = useTransition()

  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!UPLOAD_ACCEPT.split(',').includes(file.type) || file.size > UPLOAD_MAX_BYTES) {
      setProblem({ error: file.size > UPLOAD_MAX_BYTES ? 'too_large' : 'type' })
      return
    }
    setProblem(null)
    startUpload(async () => {
      const response = await fetch(`/api/media?product=${productId}`, { method: 'POST', body: file, headers: { 'X-Requested-With': 'formline' } }).catch(() => null)
      if (response?.status === 201) {
        toast.success(t('uploaded'))
        router.refresh()
        return
      }
      const body = response ? await response.json().catch(() => null) as { error?: UploadError } | null : null
      const error = body?.error ?? 'unavailable'
      if (error === 'rate_limited') setProblem({ error, minutes: Math.max(1, Math.ceil(Number(response?.headers.get('Retry-After') ?? 60) / 60)) })
      else setProblem({ error })
    })
  }

  const remove = (): void => startRemove(async () => {
    const result = await removeProductImageAction({ productId })
    setConfirming(false)
    if (result.ok) toast.success(t('removed'))
    else toast.error(t('removeFailed'))
  })

  return (
    <div className="flex flex-col gap-3">
      <ProductImage src={src} width={width} height={height} />
      <input ref={picker} type="file" accept={UPLOAD_ACCEPT} hidden onChange={upload} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => picker.current?.click()}>
          <ImageUp aria-hidden />
          {uploading ? t('uploading') : src ? t('replace') : t('upload')}
        </Button>
        {src ? (
          <Button type="button" variant="ghost" size="sm" disabled={uploading || removing} onClick={() => setConfirming(true)}>{t('remove')}</Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {problem ? (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {problem.error === 'rate_limited' ? t('errors.rate_limited', { minutes: problem.minutes }) : t(`errors.${problem.error}`)}
        </p>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('removeTitle', { name })}</DialogTitle>
            <DialogDescription>{t('removeBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
            <Button type="button" variant="destructive" disabled={removing} onClick={remove}>{removing ? t('removing') : t('removeConfirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
