'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'
import { ErrorAlert, UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
import { StockLevel } from '@/components/products/variants-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { variantFieldName, type VariantField } from '@/lib/products/fields'
import { cn } from '@/lib/utils'
import { saveVariantsAction, type VariantsState } from '@/server/actions/products'

const IDLE: VariantsState = { status: 'idle' }

/** One variant as the form starts it: the own price as field text ('' for none), the computed price as its placeholder. */
type VariantRow = { id: string; label: string; sku: string; computedPrice: string; override: string; stock: number; threshold: number }

type Props = { productId: string; rows: VariantRow[] }

// Wide: one line per variant under a shared header; narrow: the three fields below the variant's name.
const ROW = 'grid gap-x-3 gap-y-2 @xl:grid-cols-[minmax(0,1fr)_7rem_6rem_5rem] @xl:items-center'

/**
 * The variants of the product page for a role that may change them; a save resets them to the stored values. A stock
 * that moved while the page was open refuses the save: "Load the current stock" takes the stored stock into the stock
 * fields and leaves every other value typed, to be saved again.
 */
export function VariantsForm({ productId, rows }: Props) {
  const t = useTranslations('products.variants')
  const toast = useToast()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(saveVariantsAction, IDLE, form)
  useLeaveGuard(form)
  const [reloading, startReload] = useTransition()
  // The conflict whose stock was loaded: its alert goes, and its stock fields show the stored stock.
  const [reloadedAfter, setReloadedAfter] = useState<VariantsState | null>(null)
  const settle = useEffectEvent((result: VariantsState) => {
    if (result.status === 'done') toast.success(t('saved'))
    if (result.status === 'error') form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus()
  })
  useEffect(() => settle(state), [state])

  // A stock field typed in after the conflict keeps its text when its default changes: the stored stock is written in.
  const loaded = reloadedAfter !== null && state === reloadedAfter && !reloading
  useEffect(() => {
    if (!loaded) return
    for (const row of rows) {
      const input = form.current?.elements.namedItem(variantFieldName('stock', row.id))
      if (input instanceof HTMLInputElement) input.value = String(row.stock)
    }
  }, [loaded, rows])

  const reload = (): void => {
    setReloadedAfter(state)
    startReload(() => router.refresh())
  }

  const error = state.status === 'error' && state !== reloadedAfter ? state : null
  const typed = state.status === 'error' ? state.values : null
  const value = (field: VariantField, row: VariantRow, initial: string): string =>
    (field === 'stock' && loaded ? null : typed?.[variantFieldName(field, row.id)]) ?? initial
  const problem = (field: VariantField, row: VariantRow): string | undefined => {
    const issue = error?.errors[row.id]?.[field]
    return issue ? t(`errors.${issue}`) : undefined
  }
  const field = (name: VariantField, row: VariantRow, initial: string, placeholder?: string) => {
    const id = `${name}-${row.id}`
    const message = problem(name, row)
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground @xl:sr-only">{t(`fields.${name}`)}</label>
        <Input
          id={id}
          // One name with the variant's, written as one text: a label of two parts read as "Stock , A3 · Ink".
          aria-label={`${t(`fields.${name}`)}, ${row.label}`}
          name={variantFieldName(name, row.id)}
          defaultValue={value(name, row, initial)}
          inputMode={name === 'price' ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          className="h-8 text-right tabular-nums"
        />
        {message ? <p id={`${id}-error`} className="text-xs text-destructive">{message}</p> : null}
      </div>
    )
  }
  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-3">
      <UnreachedAlert unreached={unreached} />
      <input type="hidden" name="productId" value={productId} />
      {error && error.error !== 'invalid' ? (
        <ErrorAlert>
          {error.error === 'stock_conflict' ? t('failed.stock_conflict', { skus: error.skus.join(', ') }) : t(`failed.${error.error}`)}
          {error.error === 'stock_conflict' ? (
            <Button type="button" variant="link" disabled={reloading} className="ml-1 h-auto p-0 text-sm underline" onClick={reload}>{t('reload')}</Button>
          ) : null}
        </ErrorAlert>
      ) : null}
      <div aria-hidden className={cn(ROW, 'hidden border-b pb-2 text-xs font-medium text-muted-foreground @xl:grid')}>
        <span>{t('variant')}</span>
        <span className="text-right">{t('fields.price')}</span>
        <span className="text-right">{t('fields.stock')}</span>
        <span className="text-right">{t('fields.threshold')}</span>
      </div>
      <ul className="flex flex-col">
        {rows.map(row => (
          <li key={row.id} className="border-b py-2.5 last:border-b-0">
            <div role="group" aria-labelledby={`variant-${row.id}`} className={ROW}>
              <input type="hidden" name="variant" value={row.id} />
              <input type="hidden" name={variantFieldName('stockWas', row.id)} value={row.stock} />
              <span className="flex min-w-0 flex-col text-[13px]">
                <span id={`variant-${row.id}`} className="font-medium">{row.label}</span>
                <span className="text-xs break-all text-muted-foreground">{row.sku}</span>
                {row.stock <= row.threshold ? <span className="text-xs"><StockLevel stock={row.stock} threshold={row.threshold} /></span> : null}
              </span>
              <div className="grid grid-cols-3 gap-3 @xl:contents">
                {field('price', row, row.override, row.computedPrice)}
                {field('stock', row, String(row.stock))}
                {field('threshold', row, String(row.threshold))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
      </div>
    </form>
  )
}
