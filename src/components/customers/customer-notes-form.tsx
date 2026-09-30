'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { CUSTOMER_NOTES_MAX } from '@/lib/customers/notes'
import { saveCustomerNotesAction, type CustomerNotesState } from '@/server/actions/customers'

const IDLE: CustomerNotesState = { status: 'idle' }

/**
 * The customer's notes (spec §8.5). After a save the refreshed page brings the stored text, which React writes into the
 * field when it resets the form; after an error the typed text comes back instead.
 */
export function CustomerNotesForm({ customerId, notes }: { customerId: string; notes: string }) {
  const t = useTranslations('customers.detail')
  const toast = useToast()
  const field = useRef<HTMLTextAreaElement>(null)
  const [state, action, pending] = useActionState(saveCustomerNotesAction, IDLE)
  // Once per result: an effect that listed `toast` would run again after every toast it shows.
  const settle = useEffectEvent((result: CustomerNotesState) => {
    if (result.status === 'done') toast.success(t('notesSaved'))
    if (result.status === 'error') field.current?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? t(`notesErrors.${state.error}`) : null
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <Label htmlFor="customer-notes">{t('notesLabel')}</Label>
      <textarea
        ref={field}
        id="customer-notes"
        name="notes"
        rows={5}
        maxLength={CUSTOMER_NOTES_MAX}
        defaultValue={state.status === 'error' ? state.notes : notes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'customer-notes-hint customer-notes-error' : 'customer-notes-hint'}
        className="w-full rounded-lg border border-input bg-card px-2.5 py-2 text-sm placeholder:text-muted-foreground aria-invalid:border-destructive"
      />
      <p id="customer-notes-hint" className="text-xs text-muted-foreground">{t('notesHint')}</p>
      {error ? <p id="customer-notes-error" className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>{pending ? t('saving') : t('saveNotes')}</Button>
      </div>
    </form>
  )
}
