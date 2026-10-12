'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { COLLECTION_FIELDS, type CollectionField, type CollectionIssue } from '@/lib/collections/fields'
import { parseCollection } from '@/lib/collections/form'
import { formText } from '@/lib/form'
import { fail as refused, ok, type ActionResult } from '@/lib/result'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { createCollectionWithLog, deleteCollectionWithLog, moveCollectionWithLog, updateCollectionWithLog } from '@/server/collections/write'

export type CollectionState =
  | { status: 'idle' }
  | { status: 'error'; error: 'invalid' | 'forbidden' | 'not_found' | 'cap'; fieldErrors: Partial<Record<CollectionField, CollectionIssue>>; values: Record<CollectionField, string> }
  /** `slug` is the collection's address after the save; `count` tells one success from the next. */
  | { status: 'done'; slug: string; count: number }

/**
 * The collection form (spec §8.3): a new collection when the form carries no id, the saved one
 * otherwise. Like the product form, it moves the browser when the slug changes.
 */
export async function saveCollectionAction(previous: CollectionState, form: FormData): Promise<CollectionState> {
  const session = await requireSession()
  const values = Object.fromEntries(COLLECTION_FIELDS.map(field => [field, formText(form, field)])) as Record<CollectionField, string>
  const fail = (error: 'invalid' | 'forbidden' | 'not_found' | 'cap', fieldErrors: Partial<Record<CollectionField, CollectionIssue>> = {}): CollectionState =>
    ({ status: 'error', error, fieldErrors, values })
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return fail('forbidden')
  const rawId = formText(form, 'collectionId')
  const id = rawId === '' ? null : z.uuid().safeParse(rawId)
  if (id && !id.success) return fail('not_found')
  const parsed = parseCollection(values)
  if (!parsed.ok) return fail('invalid', parsed.fieldErrors)
  const actor = await actorOf(session)
  const result = id ? await updateCollectionWithLog(actor, { id: id.data, ...parsed.data }) : await createCollectionWithLog(actor, parsed.data)
  if (!result.ok) return result.reason === 'slug_taken' ? fail('invalid', { slug: 'slug_taken' }) : fail(result.reason)
  if (id && result.slug === result.previousSlug) refresh()
  return { status: 'done', slug: result.slug, count: previous.status === 'done' ? previous.count + 1 : 1 }
}

const moveInput = z.strictObject({ id: z.uuid(), direction: z.enum(['up', 'down']) })

/** "Move up" / "Move down" of the collections list (spec §8.3): the new place, to announce it. */
export async function moveCollectionAction(input: unknown): Promise<ActionResult<{ position: number; of: number }>> {
  const session = await requireSession()
  if (!can(session.role, 'catalog.write', session.workspaceKind)) return refused('forbidden')
  const parsed = moveInput.safeParse(input)
  if (!parsed.success) return refused('invalid')
  const result = await moveCollectionWithLog(await actorOf(session), parsed.data)
  refresh()
  return result.ok ? ok({ position: result.to, of: result.of }) : refused('not_found')
}

const deleteInput = z.strictObject({ id: z.uuid() })

/** "Delete collection" (spec §8.3): only an empty one; `conflict` when it holds products by now. */
export async function deleteCollectionAction(input: unknown): Promise<ActionResult<{ name: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'catalog.delete', session.workspaceKind)) return refused('forbidden')
  const parsed = deleteInput.safeParse(input)
  if (!parsed.success) return refused('invalid')
  const result = await deleteCollectionWithLog(await actorOf(session), parsed.data.id)
  // On success the dialog goes to the list, which renders afresh; a refresh here would render the deleted page again.
  if (result.ok) return ok({ name: result.name })
  refresh()
  return refused(result.reason === 'not_empty' ? 'conflict' : 'not_found')
}
