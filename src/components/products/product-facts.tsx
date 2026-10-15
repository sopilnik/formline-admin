import { useTranslations } from 'next-intl'

type Props = { slug: string; collection: string; basePrice: string; tags: string[]; description: string }

/** The product's fields for a role that cannot change them: the same facts as the form, as text. */
export function ProductFacts({ slug, collection, basePrice, tags, description }: Props) {
  const t = useTranslations('products.form')
  const none = useTranslations('products.detail')('none')
  const row = 'grid gap-0.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3'

  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className={row}><dt className="text-muted-foreground">{t('slug')}</dt><dd className="break-all">{slug}</dd></div>
      <div className={row}><dt className="text-muted-foreground">{t('collection')}</dt><dd>{collection}</dd></div>
      <div className={row}><dt className="text-muted-foreground">{t('basePrice')}</dt><dd className="tabular-nums">{basePrice}</dd></div>
      <div className={row}><dt className="text-muted-foreground">{t('tags')}</dt><dd>{tags.length > 0 ? tags.join(', ') : none}</dd></div>
      <div className={row}><dt className="text-muted-foreground">{t('description')}</dt><dd className="whitespace-pre-line">{description || none}</dd></div>
    </dl>
  )
}
