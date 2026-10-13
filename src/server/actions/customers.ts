'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { parseCustomerNotes, type CustomerNotesError } from '@/lib/customers/notes'
import { formText } from '@/lib/form'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { saveCustomerNotes } from '@/server/customers/notes'

export type CustomerNotesState =
  | { status: 'idle' }
  | { status: 'error'; error: CustomerNotesError | 'forbidden' | 'not_found'; notes: string }
  /** `count` tells one success from the next. */
  | { status: 'done'; count: number }

/** The notes form of the customer page: owners, admins and managers; last save wins. */
export async function saveCustomerNotesAction(previous: CustomerNotesState, form: FormData): Promise<CustomerNotesState> {
  const session = await requireSession()
  const text = formText(form, 'notes')
  if (!can(session.role, 'customers.notes', session.workspaceKind)) return { status: 'error', error: 'forbidden', notes: text }
  const customerId = z.uuid().safeParse(formText(form, 'customerId'))
  if (!customerId.success) return { status: 'error', error: 'not_found', notes: text }
  const parsed = parseCustomerNotes(text)
  if (!parsed.ok) return { status: 'error', error: parsed.error, notes: text }
  const outcome = await saveCustomerNotes(await actorOf(session), customerId.data, parsed.notes)
  if (outcome === 'not_found') return { status: 'error', error: 'not_found', notes: text }
  refresh()
  return { status: 'done', count: previous.status === 'done' ? previous.count + 1 : 1 }
}
