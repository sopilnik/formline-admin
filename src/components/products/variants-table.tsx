import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/** One variant as the page formats it. */
export type VariantView = { id: string; label: string; sku: string; price: string; custom: boolean; stock: number; lowStockThreshold: number }

const TH = 'h-9 border-b px-3 text-left font-medium whitespace-nowrap text-muted-foreground first:pl-0 last:pr-0'
const TD = 'border-b px-3 py-2 first:pl-0 last:pr-0 group-last/row:border-b-0'

/**
 * "Sold out", "2 left" or the count, colored as on the overview's low-stock card. Spelled, the count carries its
 * word ("31 in stock"): the phone list has no column header to name it.
 */
export function StockLevel({ stock, threshold, spelled = false }: { stock: number; threshold: number; spelled?: boolean }) {
  const t = useTranslations('products')

  if (stock === 0) return <span className="font-semibold text-status-bad">{t('variants.soldOut')}</span>
  if (stock <= threshold) return <span className="font-semibold text-status-warn">{t('variants.left', { count: stock })}</span>

  return <span>{spelled ? t('inStock', { stock }) : stock}</span>
}

/** The variants for a role that cannot change them: a table while the card is 36 rem wide, a list below. */
export function VariantsTable({ variants }: { variants: VariantView[] }) {
  const t = useTranslations('products.variants')

  return (
    <>
      <table aria-labelledby="variants-title" className="hidden w-full border-separate border-spacing-0 text-[13px] tabular-nums @xl:table">
        <thead>
          <tr>
            <th scope="col" className={TH}>{t('variant')}</th>
            <th scope="col" className={TH}>{t('sku')}</th>
            <th scope="col" className={cn(TH, 'text-right')}>{t('price')}</th>
            <th scope="col" className={cn(TH, 'text-right')}>{t('stock')}</th>
            <th scope="col" className={cn(TH, 'text-right')}>{t('threshold')}</th>
          </tr>
        </thead>
        <tbody>
          {variants.map(v => (
            <tr key={v.id} className="group/row">
              <td className={cn(TD, 'font-medium whitespace-nowrap')}>{v.label}</td>
              <td className={cn(TD, 'break-all text-muted-foreground')}>{v.sku}</td>
              <td className={cn(TD, 'text-right whitespace-nowrap')}>
                {v.price}
                {v.custom ? <small className="block text-xs text-muted-foreground">{t('custom')}</small> : null}
              </td>
              <td className={cn(TD, 'text-right whitespace-nowrap')}><StockLevel stock={v.stock} threshold={v.lowStockThreshold} /></td>
              <td className={cn(TD, 'text-right')}>{v.lowStockThreshold}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-labelledby="variants-title" className="flex flex-col @xl:hidden">
        {variants.map(v => (
          <li key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b py-2.5 text-[13px] tabular-nums last:border-b-0">
            <span className="font-medium">{v.label}</span>
            <span className="text-right whitespace-nowrap">{v.price}</span>
            <span className="text-xs break-all text-muted-foreground">{v.sku}</span>
            <span className="text-right text-xs whitespace-nowrap"><StockLevel stock={v.stock} threshold={v.lowStockThreshold} spelled /></span>
          </li>
        ))}
      </ul>
    </>
  )
}
