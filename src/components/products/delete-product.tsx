'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { deleteProductAction } from '@/server/actions/products'

type Props = { productId: string; name: string; variants: number; hasImage: boolean; blocked: 'has_orders' | 'not_draft' | null }

/**
 * "Delete product" (spec §8.3): a draft without orders goes after a confirmation that names it;
 * any other product says why it stays and points to archiving instead.
 */
export function DeleteProduct({ productId, name, variants, hasImage, blocked }: Props) {
  const t = useTranslations('products.delete')
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const remove = (): void => startTransition(async () => {
    const result = await deleteProductAction({ productId })
    if (result.ok) {
      setOpen(false)
      toast.success(t('done', { name }))
      router.push('/products')
      // The refresh after the move clears the pages the browser keeps for a minute (W.1), so the list drops the deleted one.
      router.refresh()
    } else {
      setOpen(false)
      toast.error(result.code === 'conflict' ? t('conflict') : t('failed'))
    }
  })
  if (blocked) return <p className="text-[13px] text-muted-foreground">{t(`blocked.${blocked}`)}</p>
  return (
    <>
      <p className="text-[13px] text-muted-foreground">{t('body')}</p>
      <div>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>{t('button')}</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle', { name })}</DialogTitle>
            <DialogDescription>{t(hasImage ? 'confirmBodyImage' : 'confirmBody', { count: variants })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={remove}>{pending ? t('deleting') : t('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
