'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { formText } from '@/lib/auth-form'
import {
  DETAIL_FIELDS, VARIANT_FIELDS, variantFieldName, type DetailField, type DetailIssue, type NewProductField, type NewProductIssue,
} from '@/lib/products/fields'
import { parsePalettes, parseProductDetails } from '@/lib/products/form'
import { PRODUCT_STATUSES, type ProductStatus } from '@/lib/products/status'
import { parseVariants, type VariantErrors } from '@/lib/products/variants'
import { ok, type ActionResult, type ErrorCode } from '@/lib/result'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { removeProductImage } from '@/server/media/upload'
import { createProductWithLog } from '@/server/products/create'
import { saveProductDetails } from '@/server/products/details'
import { changeProductStatusWithLog, deleteProductWithLog } from '@/server/products/status'
import { saveVariantsWithLog } from '@/server/products/variants'

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

export type VariantsState =
  | { status: 'idle' }
  | {
    status: 'error'; error: 'invalid' | 'forbidden' | 'not_found' | 'stock_conflict'
    /** Per variant id, the fields with a problem; `skus` are the variants whose stock moved on. */
    errors: VariantErrors; skus: string[]
    /** What was sent, by field name, to put back into the fields. */
    values: Record<string, string>
  }
  | { status: 'done'; count: number }

/** The variant form of the product page (spec §8.3): own prices, stock and thresholds in one save. */
export async function saveVariantsAction(previous: VariantsState, form: FormData): Promise<VariantsState> {
  const session = await requireSession()
  const variantIds = form.getAll('variant').filter((value): value is string => typeof value === 'string')
  const values = Object.fromEntries(variantIds.flatMap(id => VARIANT_FIELDS.map(field => {
    const name = variantFieldName(field, id)
    return [name, formText(form, name)]
  })))
  const fail = (error: 'invalid' | 'forbidden' | 'not_found' | 'stock_conflict', errors: VariantErrors = {}, skus: string[] = []): VariantsState =>
    ({ status: 'error', error, errors, skus, values })
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return fail('forbidden')
  const productId = z.uuid().safeParse(formText(form, 'productId'))
  const parsed = parseVariants(variantIds, name => formText(form, name))
  if (!productId.success || parsed === null) return fail('not_found')
  if (!parsed.ok) return fail('invalid', parsed.errors)
  const result = await saveVariantsWithLog(await actorOf(session), productId.data, parsed.rows)
  if (!result.ok) return result.reason === 'stock_conflict' ? fail('stock_conflict', {}, result.skus) : fail('not_found')
  refresh()
  return { status: 'done', count: previous.status === 'done' ? previous.count + 1 : 1 }
}

const statusInput = z.strictObject({ productId: z.uuid(), to: z.enum(PRODUCT_STATUSES) })
const refused = (code: ErrorCode): ActionResult<never> => ({ ok: false, code })

/** The status control of the product page (spec §8.3): `conflict` when the product moved on meanwhile. */
export async function changeProductStatusAction(input: unknown): Promise<ActionResult<{ to: ProductStatus }>> {
  const session = await requireSession()
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return refused('forbidden')
  const parsed = statusInput.safeParse(input)
  if (!parsed.success) return refused('invalid')
  const result = await changeProductStatusWithLog(await actorOf(session), parsed.data.productId, parsed.data.to)
  refresh()
  if (result.ok) return ok({ to: result.to })
  return refused(result.reason === 'invalid_transition' ? 'conflict' : 'not_found')
}

const deleteInput = z.strictObject({ productId: z.uuid() })

/** "Delete product" (spec §8.3): only a draft without orders; `conflict` when the product is no longer one. */
export async function deleteProductAction(input: unknown): Promise<ActionResult<{ name: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'catalog.delete', session.workspaceKind)) return refused('forbidden')
  const parsed = deleteInput.safeParse(input)
  if (!parsed.success) return refused('invalid')
  const result = await deleteProductWithLog(await actorOf(session), parsed.data.productId)
  if (result.ok) return ok({ name: result.name })
  refresh()
  return refused(result.reason === 'not_found' ? 'not_found' : 'conflict')
}

const imageInput = z.strictObject({ productId: z.uuid() })

/** "Remove image" of the product page (spec §8.4): the product keeps no image; an upload's file is queued for deletion. */
export async function removeProductImageAction(input: unknown): Promise<ActionResult<null>> {
  const session = await requireSession()
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return refused('forbidden')
  const parsed = imageInput.safeParse(input)
  if (!parsed.success) return refused('invalid')
  const result = await removeProductImage(await actorOf(session), parsed.data.productId)
  refresh()
  return result.ok ? ok(null) : refused('not_found')
}
