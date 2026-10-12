'use client'

import { useTranslations } from 'next-intl'
import { SelectField, TextAreaField, TextField } from '@/components/app/form-fields'
import { DESCRIPTION_MAX, PRODUCT_NAME_MAX, PRODUCT_SLUG_MAX, type DetailField, type NewProductIssue } from '@/lib/products/fields'

type Props = {
  values: Record<DetailField, string>
  errors: Partial<Record<DetailField, NewProductIssue>>
  collections: { id: string; name: string }[]
  /** The slug the name would give, shown while the slug field is empty (the new-product form). */
  slugPlaceholder?: string
  onNameInput?: (name: string) => void
}

/**
 * The product's own fields (spec §8.3), shared by the product page and the new-product form. The
 * fields are uncontrolled: `values` are their starting text, which after a failed save is what was sent.
 */
export function ProductDetailsFields({ values, errors, collections, slugPlaceholder, onNameInput }: Props) {
  const t = useTranslations('products.form')
  const error = (field: DetailField): string | undefined => (errors[field] ? t(`errors.${errors[field]}`) : undefined)
  return (
    <div className="flex flex-col gap-4">
      <TextField
        id="product-name" name="name" label={t('name')} defaultValue={values.name} maxLength={PRODUCT_NAME_MAX} aria-required autoComplete="off"
        error={error('name')} onInput={onNameInput ? event => onNameInput(event.currentTarget.value) : undefined}
      />
      <TextField
        id="product-slug" name="slug" label={t('slug')} defaultValue={values.slug} maxLength={PRODUCT_SLUG_MAX} autoComplete="off"
        spellCheck={false} placeholder={slugPlaceholder} hint={t('slugHint')} error={error('slug')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="product-collection" name="collection" label={t('collection')} defaultValue={values.collection} error={error('collection')}>
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <TextField
          id="product-price" name="basePrice" label={t('basePrice')} defaultValue={values.basePrice} inputMode="decimal" autoComplete="off"
          aria-required hint={t('basePriceHint')} error={error('basePrice')}
        />
      </div>
      <TextField id="product-tags" name="tags" label={t('tags')} defaultValue={values.tags} autoComplete="off" hint={t('tagsHint')} error={error('tags')} />
      <TextAreaField
        id="product-description" name="description" label={t('description')} defaultValue={values.description} rows={5} maxLength={DESCRIPTION_MAX}
        error={error('description')}
      />
    </div>
  )
}
