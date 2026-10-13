'use client'

import { ImageUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition, type ChangeEvent } from 'react'
import { ErrorAlert } from '@/components/app/form-parts'
import { ProductImage, type PosterImage } from '@/components/products/product-image'
import { sendProductImage, type UploadProblem } from '@/components/products/send-product-image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { precheckUpload, UPLOAD_ACCEPT } from '@/lib/uploads'
import { removeProductImageAction } from '@/server/actions/products'

type Props = { productId: string; name: string; image: PosterImage | null }

/**
 * The image of the product page for a role that may change it. The file goes to
 * `POST /api/media` as the request body; the picker refuses what could never pass, the server
 * decides the rest. Removing asks first, as every deletion does.
 */
export function ProductImageEditor({ productId, name, image }: Props) {
  const t = useTranslations('products.image')
  const toast = useToast()
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<UploadProblem | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [uploading, startUpload] = useTransition()
  const [removing, startRemove] = useTransition()

  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const refused = precheckUpload(file)
    if (refused) {
      setProblem({ error: refused })
      return
    }

    setProblem(null)
    startUpload(async () => {
      const failed = await sendProductImage(productId, file)
      if (failed) {
        setProblem(failed)
        return
      }
      toast.success(t('uploaded'))
      router.refresh()
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
      <ProductImage image={image} />
      <input ref={picker} type="file" accept={UPLOAD_ACCEPT} hidden onChange={upload} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => picker.current?.click()}>
          <ImageUp aria-hidden />
          {uploading ? t('uploading') : image ? t('replace') : t('upload')}
        </Button>
        {image ? (
          <Button type="button" variant="ghost" size="sm" disabled={uploading || removing} onClick={() => setConfirming(true)}>{t('remove')}</Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {problem ? (
        <ErrorAlert>
          {problem.error === 'rate_limited' ? t('errors.rate_limited', { minutes: problem.minutes }) : t(`errors.${problem.error}`)}
        </ErrorAlert>
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
