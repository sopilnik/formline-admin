'use client'

import { useTranslations } from 'next-intl'
import { useEffect, type ReactNode } from 'react'
import type { FormState } from '@/lib/auth-form'

type ErrorState = Extract<FormState, { status: 'error' }>

export function useErrorMessage(): (state: ErrorState) => string {
  const t = useTranslations('auth.errors')
  return state => t(state.error, { minutes: state.retryAfterMinutes ?? 1 })
}

/** The error of one field, shown next to it. */
export function useErrorText<F extends string>(state: FormState<F>): (field: F) => string | undefined {
  const message = useErrorMessage()
  return field => (state.status === 'error' && state.field === field ? message(state) : undefined)
}

/** An error that belongs to no field, above the form or the control it is about; a form may move focus to it. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return <p role="alert" tabIndex={-1} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{children}</p>
}

/** A form state's error that belongs to no field, above the form. */
export function FormAlert({ state }: { state: FormState }) {
  const message = useErrorMessage()
  if (state.status !== 'error' || state.field) return null
  return <ErrorAlert>{message(state)}</ErrorAlert>
}

/** After a failed submit, focus goes to the field in error, or to the first field (spec §11, forms). */
export function useFocusOnError(state: FormState, prefix: string, firstField: string): void {
  useEffect(() => {
    if (state.status !== 'error') return
    document.getElementById(`${prefix}-${state.field ?? firstField}`)?.focus()
  }, [state, prefix, firstField])
}
