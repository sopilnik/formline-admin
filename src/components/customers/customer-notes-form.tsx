'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { TextAreaField } from '@/components/app/form-fields'
import { Button } from '@/components/ui/button'
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
  // Once per result, with the latest translations.
  const settle = useEffectEvent((result: CustomerNotesState) => {
    if (result.status === 'done') toast.success(t('notesSaved'))
    if (result.status === 'error') field.current?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? t(`notesErrors.${state.error}`) : undefined
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <TextAreaField
        ref={field}
        id="customer-notes"
        name="notes"
        label={t('notesLabel')}
        hint={t('notesHint')}
        error={error}
        rows={5}
        maxLength={CUSTOMER_NOTES_MAX}
        defaultValue={state.status === 'error' ? state.notes : notes}
      />
      <div>
        <Button type="submit" size="sm" disabled={pending}>{pending ? t('saving') : t('saveNotes')}</Button>
      </div>
    </form>
  )
}
