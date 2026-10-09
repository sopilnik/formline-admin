'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'
import { NewProductImage } from '@/components/products/new-product-image'
import { ProductDetailsFields } from '@/components/products/product-details-fields'
import { sendProductImage } from '@/components/products/send-product-image'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { PALETTE_IDS, paletteName } from '@/lib/catalog'
import { DETAIL_FIELDS, PRODUCT_SLUG_MAX, type DetailField } from '@/lib/products/fields'
import { productHref } from '@/lib/products/view'
import { slugify } from '@/lib/slug'
import { createProductAction, type CreateState } from '@/server/actions/products'

const IDLE: CreateState = { status: 'idle' }

type Props = { collections: { id: string; name: string }[] }

/**
 * The new-product form (spec §8.3). The slug field shows the slug the name gives while it is
 * empty; the palettes are plain checkboxes, so a failed save puts back exactly what was ticked.
 * An image chosen here is sent once the product exists (W.9); if the server refuses it, the
 * product stays and the toast says why.
 */
export function NewProductForm({ collections }: Props) {
  const t = useTranslations('products.new')
  const fieldText = useTranslations('products.form')
  const imageErrors = useTranslations('products.image.errors')
  const toast = useToast()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [state, action, pending] = useActionState(createProductAction, IDLE)
  const [uploading, startUpload] = useTransition()
  const settle = useEffectEvent((result: CreateState) => {
    if (result.status === 'done') {
      // The refresh after the move clears the pages the browser keeps for a minute (W.1), so the list shows the product.
      const moveOn = (): void => {
        router.push(productHref(result.slug))
        router.refresh()
      }
      if (!image) {
        toast.success(t('created'))
        moveOn()
        return
      }

      startUpload(async () => {
        const failed = await sendProductImage(result.id, image)
        if (!failed) toast.success(t('created'))
        else toast.error(t('imageFailed', { reason: failed.error === 'rate_limited' ? imageErrors('rate_limited', { minutes: failed.minutes }) : imageErrors(failed.error) }))
        moveOn()
      })
    }
    if (result.status === 'error') {
      const first = [...DETAIL_FIELDS, 'palettes' as const].find(field => result.fieldErrors[field])
      form.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : '[role="alert"]')?.focus()
    }
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? state : null
  const values: Record<DetailField, string> = error?.values ?? { name: '', slug: '', collection: collections[0]?.id ?? '', basePrice: '', tags: '', description: '' }
  const palettesError = error?.fieldErrors.palettes ? fieldText(`errors.${error.fieldErrors.palettes}`) : undefined
  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-5">
      {error && error.error !== 'invalid' ? (
        <p role="alert" tabIndex={-1} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{t(`failed.${error.error}`)}</p>
      ) : null}
      <ProductDetailsFields
        values={values}
        errors={error?.fieldErrors ?? {}}
        collections={collections}
        slugPlaceholder={slugify(name || values.name, PRODUCT_SLUG_MAX)}
        onNameInput={setName}
      />
      <NewProductImage file={image} onChange={setImage} disabled={pending || uploading} />
      <fieldset aria-describedby={palettesError ? 'palettes-hint palettes-error' : 'palettes-hint'} className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('palettes')}</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {PALETTE_IDS.map(id => (
            <label key={id} className="flex min-h-6 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="palettes"
                value={id}
                defaultChecked={error?.palettes.includes(id) ?? false}
                aria-invalid={palettesError ? true : undefined}
                className="size-4 accent-selected"
              />
              {paletteName(id)}
            </label>
          ))}
        </div>
        <p id="palettes-hint" className="text-xs text-muted-foreground">{t('palettesHint')}</p>
        {palettesError ? <p id="palettes-error" className="text-sm text-destructive">{palettesError}</p> : null}
      </fieldset>
      <div>
        <Button type="submit" disabled={pending || uploading}>{pending ? t('creating') : uploading ? t('imageUploading') : t('create')}</Button>
      </div>
    </form>
  )
}
