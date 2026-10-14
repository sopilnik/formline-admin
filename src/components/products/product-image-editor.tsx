'use client'

import { ImageUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react'
import { ErrorAlert } from '@/components/app/form-parts'
import { useReach } from '@/components/app/use-reach'
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
  const send = useReach()
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<UploadProblem | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Not a transition: an async transition would hold every navigation until the upload ended. Its success comes as a
  // toast, and so does a refusal once the person has left the page.
  const [uploading, setUploading] = useState(false)
  const [removing, startRemove] = useTransition()
  const here = useRef(true)
  useEffect(() => {
    here.current = true

    return () => {
      here.current = false
    }
  }, [])
  const say = (refused: UploadProblem): string => (refused.error === 'rate_limited' ? t('errors.rate_limited', { minutes: refused.minutes }) : t(`errors.${refused.error}`))

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
    setUploading(true)
    void sendProductImage(productId, file).then(failed => {
      setUploading(false)
      if (failed) {
        if (here.current) setProblem(failed)
        else toast.error(say(failed))
        return
      }

      toast.success(t('uploaded'))
      router.refresh()
    })
  }

  const remove = (): void => startRemove(async () => {
    const result = await send(() => removeProductImageAction({ productId }))
    if (!result) return
    setConfirming(false)
    if (result.ok) {
      setProblem(null)
      toast.success(t('removed'))
    } else toast.error(t('removeFailed'))
  })

  return (
    <div className="flex flex-col gap-3">
      <ProductImage image={image} />
      <input ref={picker} type="file" accept={UPLOAD_ACCEPT} hidden onChange={upload} />
      {/* One button under the other in every language: a long Russian label no longer wraps the second below the first. */}
      <div data-focus-key="product-image" className="flex flex-col items-start gap-2">
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
        <ErrorAlert>{say(problem)}</ErrorAlert>
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
