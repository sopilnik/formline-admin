'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { ErrorAlert, UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
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
 * The new-product form. The slug field shows the slug the name gives while it is
 * empty; the palettes are plain checkboxes, so a failed save puts back exactly what was ticked.
 * An image chosen here is sent once the product exists; if the server refuses it, the
 * product stays and the toast says why. While it uploads the fields stay as typed, and the
 * owner may go elsewhere.
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
  const [state, action, pending, unreached] = useFormAction(createProductAction, IDLE, form)

  useLeaveGuard(form, state.status === 'error')

  // Once the product exists, its image is on the way until the form moves on.
  const uploading = state.status === 'done' && image !== null
  // True once the owner has left the page, so an upload that ends later does not pull them back.
  const left = useRef(false)

  useEffect(() => {
    left.current = false

    return () => {
      left.current = true
    }
  }, [])

  const settle = useEffectEvent((result: CreateState) => {
    if (result.status === 'done') {
      // The refresh clears the pages the browser keeps for a minute, so the list shows the product; an owner who
      // went elsewhere while the image uploaded stays there.
      const moveOn = (): void => {
        if (!left.current) router.push(productHref(result.slug))
        router.refresh()
      }

      if (!image) {
        toast.success(t('created'))
        moveOn()

        return
      }

      // A plain promise, not a transition: React would hold every navigation until a transition's upload ends.
      void sendProductImage(result.id, image).then(failed => {
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

  // Sent by hand rather than as the form's action, so React does not clear the fields once the product is created: they
  // stay in view while its image uploads.
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)

    startTransition(() => action(data))
  }

  return (
    <form ref={form} action={action} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <UnreachedAlert unreached={unreached} />
      {error && error.error !== 'invalid' ? (
        <ErrorAlert>{t(`failed.${error.error}`)}</ErrorAlert>
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
