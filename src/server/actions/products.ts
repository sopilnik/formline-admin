'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { formText } from '@/lib/auth-form'
import { DETAIL_FIELDS, type DetailField, type DetailIssue, type NewProductField, type NewProductIssue } from '@/lib/products/fields'
import { parsePalettes, parseProductDetails } from '@/lib/products/form'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { createProductWithLog } from '@/server/products/create'
import { saveProductDetails } from '@/server/products/details'

const VERSION = /^\d{1,20}$/

export type DetailsState =
  | { status: 'idle' }
  | {
    status: 'error'; error: 'invalid' | 'forbidden' | 'not_found' | 'conflict'
    fieldErrors: Partial<Record<DetailField, DetailIssue>>; values: Record<DetailField, string>
  }
  /** `slug` is the product's address after the save; `count` tells one success from the next. */
  | { status: 'done'; slug: string; count: number }

/**
 * The details form of the product page (spec §8.3). When the slug changes the page's address
 * changes with it: the form moves the browser there, so the old address is not rendered again.
 */
export async function updateProductDetailsAction(previous: DetailsState, form: FormData): Promise<DetailsState> {
  const session = await requireSession()
  const values = Object.fromEntries(DETAIL_FIELDS.map(field => [field, formText(form, field)])) as Record<DetailField, string>
  const fail = (error: 'invalid' | 'forbidden' | 'not_found' | 'conflict', fieldErrors: Partial<Record<DetailField, DetailIssue>> = {}): DetailsState =>
    ({ status: 'error', error, fieldErrors, values })
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return fail('forbidden')
  const productId = z.uuid().safeParse(formText(form, 'productId'))
  const version = formText(form, 'version')
  if (!productId.success || !VERSION.test(version)) return fail('not_found')
  const parsed = parseProductDetails(values)
  if (!parsed.ok) return fail('invalid', parsed.fieldErrors)
  const result = await saveProductDetails(await actorOf(session), { productId: productId.data, version, ...parsed.data })
  if (!result.ok) {
    if (result.reason === 'slug_taken') return fail('invalid', { slug: 'slug_taken' })
    if (result.reason === 'collection_missing') return fail('invalid', { collection: 'collection_missing' })
    return fail(result.reason)
  }
  if (result.slug === result.previousSlug) refresh()
  return { status: 'done', slug: result.slug, count: previous.status === 'done' ? previous.count + 1 : 1 }
}

export type CreateState =
  | { status: 'idle' }
  | {
    status: 'error'; error: 'invalid' | 'forbidden' | 'cap'
    fieldErrors: Partial<Record<NewProductField, NewProductIssue>>; values: Record<DetailField, string>; palettes: string[]
  }
  | { status: 'done'; slug: string }

/** The new-product form (spec §8.3): a draft whose variants start without stock; the form then opens its page. */
export async function createProductAction(_previous: CreateState, form: FormData): Promise<CreateState> {
  const session = await requireSession()
  const values = Object.fromEntries(DETAIL_FIELDS.map(field => [field, formText(form, field)])) as Record<DetailField, string>
  const ticked = form.getAll('palettes').filter((value): value is string => typeof value === 'string')
  const fail = (error: 'invalid' | 'forbidden' | 'cap', fieldErrors: Partial<Record<NewProductField, NewProductIssue>> = {}): CreateState =>
    ({ status: 'error', error, fieldErrors, values, palettes: ticked })
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return fail('forbidden')
  const parsed = parseProductDetails(values)
  const palettes = parsePalettes(ticked)
  const fieldErrors: Partial<Record<NewProductField, NewProductIssue>> = parsed.ok ? {} : { ...parsed.fieldErrors }
  if (!palettes) fieldErrors.palettes = 'palettes_missing'
  if (!parsed.ok || !palettes) return fail('invalid', fieldErrors)
  const result = await createProductWithLog(await actorOf(session), { ...parsed.data, palettes })
  if (!result.ok) {
    if (result.reason === 'cap') return fail('cap')
    if (result.reason === 'collection_missing') return fail('invalid', { collection: 'collection_missing' })
    return fail('invalid', { slug: result.reason === 'slug_taken' ? 'slug_taken' : 'sku_taken' })
  }
  return { status: 'done', slug: result.slug }
}
