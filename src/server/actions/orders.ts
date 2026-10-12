'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { formText } from '@/lib/auth-form'
import { parseNote, type NoteError } from '@/lib/orders/note'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'
import { fail, ok, type ActionResult } from '@/lib/result'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { changeStatuses, type StatusOutcome } from '@/server/orders/change-status'
import { addNote } from '@/server/orders/notes'

const statusInput = z.object({ ids: z.array(z.uuid()).min(1).max(100), to: z.enum(ORDER_STATUSES) })
const oneStatusInput = z.object({ orderId: z.uuid(), to: z.enum(ORDER_STATUSES) })

/** "Change status" of the bulk bar (spec §8.2): the valid orders change, the others come back as skipped. */
export async function changeStatusesAction(input: unknown): Promise<ActionResult<StatusOutcome>> {
  const session = await requireSession()
  if (!can(session.role, 'orders.update', session.workspaceKind)) return fail('forbidden')
  const parsed = statusInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const outcome = await changeStatuses(await actorOf(session), parsed.data.ids, parsed.data.to)
  // The list, its chip counts and the sidebar count all change: the router re-renders the page.
  refresh()
  return ok(outcome)
}

/** The status control of the order page (amendment 7): `conflict` when the order moved on meanwhile. */
export async function changeOrderStatusAction(input: unknown): Promise<ActionResult<{ number: number; to: OrderStatus }>> {
  const session = await requireSession()
  if (!can(session.role, 'orders.update', session.workspaceKind)) return fail('forbidden')
  const parsed = oneStatusInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const outcome = await changeStatuses(await actorOf(session), [parsed.data.orderId], parsed.data.to)
  refresh()
  if (outcome.changed.length === 1) return ok({ number: outcome.changed[0]!, to: parsed.data.to })
  return fail(outcome.skipped.length === 1 ? 'conflict' : 'not_found')
}

export type NoteState =
  | { status: 'idle' }
  | { status: 'error'; error: NoteError | 'forbidden' | 'not_found'; note: string }
  | { status: 'done'; count: number }

/** The internal note form of the order page (amendment 8). `count` tells one success from the next. */
export async function addOrderNoteAction(previous: NoteState, form: FormData): Promise<NoteState> {
  const session = await requireSession()
  const text = formText(form, 'note')
  if (!can(session.role, 'orders.update', session.workspaceKind)) return { status: 'error', error: 'forbidden', note: text }
  const orderId = z.uuid().safeParse(formText(form, 'orderId'))
  if (!orderId.success) return { status: 'error', error: 'not_found', note: text }
  const parsed = parseNote(text)
  if (!parsed.ok) return { status: 'error', error: parsed.error, note: text }
  const number = await addNote(await actorOf(session), orderId.data, parsed.note)
  if (number === null) return { status: 'error', error: 'not_found', note: text }
  refresh()
  return { status: 'done', count: previous.status === 'done' ? previous.count + 1 : 1 }
}
