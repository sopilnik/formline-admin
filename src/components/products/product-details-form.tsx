'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'
import { ErrorAlert, UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
import { ProductDetailsFields } from '@/components/products/product-details-fields'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DETAIL_FIELDS, type DetailField } from '@/lib/products/fields'
import { productHref } from '@/lib/products/view'
import { updateProductDetailsAction, type DetailsState } from '@/server/actions/products'

const IDLE: DetailsState = { status: 'idle' }

type Props = {
  productId: string
  slug: string
  /** The concurrency token of the loaded product (`ProductDetail.version`). */
  version: string
  values: Record<DetailField, string>
  collections: { id: string; name: string }[]
}

/**
 * The details form of the product page. After a save React resets the fields to the
 * stored values the refreshed page brings; after a conflict "Load the current version" starts
 * the form afresh from them, dropping what was typed.
 */
export function ProductDetailsForm(props: Props) {
  const router = useRouter()
  const [reloading, startReload] = useTransition()
  const [generation, setGeneration] = useState(0)
  const reload = (): void => startReload(() => {
    router.refresh()
    setGeneration(n => n + 1)
  })

  return <DetailsForm key={generation} {...props} reloading={reloading} onReload={reload} />
}

function DetailsForm({ productId, slug, version, values, collections, reloading, onReload }: Props & { reloading: boolean; onReload: () => void }) {
  const t = useTranslations('products.form')
  const toast = useToast()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(updateProductDetailsAction, IDLE, form)

  useLeaveGuard(form, state.status === 'error')

  // Once per result, with the latest translations.
  const settle = useEffectEvent((result: DetailsState) => {
    if (result.status === 'done') {
      toast.success(t('saved'))
      if (result.slug !== slug) {
        // The refresh after the move clears the pages the browser keeps for a minute, so the list links to the new
        // address. The action cannot refresh: that would draw the old address again.
        router.replace(productHref(result.slug))
        router.refresh()
      }
    }
    if (result.status === 'error') {
      const first = DETAIL_FIELDS.find(field => result.fieldErrors[field])

      form.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : '[role="alert"]')?.focus()
    }
  })

  useEffect(() => settle(state), [state])

  const failure = state.status === 'error' && state.error !== 'invalid' ? state.error : null

  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <UnreachedAlert unreached={unreached} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="version" value={version} />
      {failure ? (
        <ErrorAlert>
          {t(`failed.${failure}`)}
          {failure === 'conflict' ? (
            <Button type="button" variant="link" disabled={reloading} className="ml-1 h-auto p-0 text-sm underline" onClick={onReload}>{t('reload')}</Button>
          ) : null}
        </ErrorAlert>
      ) : null}
      <ProductDetailsFields values={state.status === 'error' ? state.values : values} errors={state.status === 'error' ? state.fieldErrors : {}} collections={collections} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
      </div>
    </form>
  )
}
