'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef, useState } from 'react'
import { TextAreaField, TextField } from '@/components/app/form-fields'
import { ErrorAlert } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_FIELDS, COLLECTION_NAME_MAX, COLLECTION_SLUG_MAX, type CollectionField } from '@/lib/collections/fields'
import { collectionHref } from '@/lib/collections/view'
import { slugify } from '@/lib/slug'
import { saveCollectionAction, type CollectionState } from '@/server/actions/collections'

const IDLE: CollectionState = { status: 'idle' }
const EMPTY: Record<CollectionField, string> = { name: '', slug: '', description: '' }

type Props = { collection?: { id: string; slug: string; name: string; description: string } }

/** A new collection, or the fields of an existing one (spec §8.3). The slug field shows the slug the name gives while it is empty. */
export function CollectionForm({ collection }: Props) {
  const t = useTranslations('collections.form')
  const toast = useToast()
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [name, setName] = useState(collection?.name ?? '')
  const [state, action, pending] = useActionState(saveCollectionAction, IDLE)

  const settle = useEffectEvent((result: CollectionState) => {
    if (result.status === 'done') {
      toast.success(collection ? t('saved') : t('created'))
      // The refresh after a move clears the pages the browser keeps for a minute (W.1), so the list shows the change.
      // The action refreshes only when the address stays: refreshing there would draw the old address again.
      if (!collection) {
        router.push(collectionHref(result.slug))
        router.refresh()
      } else if (result.slug !== collection.slug) {
        router.replace(collectionHref(result.slug))
        router.refresh()
      }
    }

    if (result.status === 'error') {
      const first = COLLECTION_FIELDS.find(field => result.fieldErrors[field])
      form.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : '[role="alert"]')?.focus()
    }
  })
  useEffect(() => settle(state), [state])

  const error = state.status === 'error' ? state : null
  const values = error?.values ?? (collection ? { name: collection.name, slug: collection.slug, description: collection.description } : EMPTY)
  const message = (field: CollectionField): string | undefined => (error?.fieldErrors[field] ? t(`errors.${error.fieldErrors[field]}`) : undefined)

  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="collectionId" value={collection?.id ?? ''} />
      {error && error.error !== 'invalid' ? (
        <ErrorAlert>{t(`failed.${error.error}`)}</ErrorAlert>
      ) : null}
      <TextField
        id="collection-name" name="name" label={t('name')} defaultValue={values.name} maxLength={COLLECTION_NAME_MAX} aria-required autoComplete="off"
        error={message('name')} onInput={event => setName(event.currentTarget.value)}
      />
      <TextField
        id="collection-slug" name="slug" label={t('slug')} defaultValue={values.slug} maxLength={COLLECTION_SLUG_MAX} autoComplete="off" spellCheck={false}
        placeholder={slugify(name, COLLECTION_SLUG_MAX)} hint={t('slugHint')} error={message('slug')}
      />
      <TextAreaField
        id="collection-description" name="description" label={t('description')} defaultValue={values.description} rows={4}
        maxLength={COLLECTION_DESCRIPTION_MAX} error={message('description')}
      />
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : collection ? t('save') : t('create')}</Button>
      </div>
    </form>
  )
}
