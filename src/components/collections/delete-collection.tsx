'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { deleteCollectionAction } from '@/server/actions/collections'

/** "Delete collection" (spec §8.3): an empty one after a confirmation that names it; otherwise why it stays. */
export function DeleteCollection({ id, name, products }: { id: string; name: string; products: number }) {
  const t = useTranslations('collections.delete')
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const remove = (): void => startTransition(async () => {
    const result = await deleteCollectionAction({ id })
    setOpen(false)
    if (result.ok) {
      toast.success(t('done', { name }))
      router.push('/collections')
    } else {
      toast.error(result.code === 'conflict' ? t('conflict') : t('failed'))
    }
  })
  if (products > 0) return <p className="text-[13px] text-muted-foreground">{t('blocked', { count: products })}</p>
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
            <DialogDescription>{t('confirmBody')}</DialogDescription>
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
