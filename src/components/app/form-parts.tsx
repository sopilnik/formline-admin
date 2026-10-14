'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { FormState } from '@/lib/auth-form'
import { reach } from '@/lib/reach'

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
export function ErrorAlert({ children, className }: { children: ReactNode; className?: string }) {
  const base = 'rounded-md border border-destructive px-3 py-2 text-sm text-destructive'
  return <p role="alert" tabIndex={-1} className={className ? `${base} ${className}` : base}>{children}</p>
}

/** A form state's error that belongs to no field, above the form. */
export function FormAlert({ state }: { state: FormState }) {
  const message = useErrorMessage()
  if (state.status !== 'error' || state.field) return null
  return <ErrorAlert>{message(state)}</ErrorAlert>
}

/** After a failed submit, focus goes to the field in error, or to the first field. */
export function useFocusOnError(state: FormState, prefix: string, firstField: string): void {
  useEffect(() => {
    if (state.status !== 'error') return
    document.getElementById(`${prefix}-${state.field ?? firstField}`)?.focus()
  }, [state, prefix, firstField])
}

/** A submit whose request got no answer: what it sent, and a count that tells one such submit from the next. */
export type Unreached = { sent: FormData; count: number }

/** Writes what a form sent back into its fields after React reset them: the passwords stay empty. */
function refill(form: HTMLFormElement, sent: FormData): void {
  for (const field of form.elements) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name) continue
    if (field.type === 'hidden' || field.type === 'file' || field.type === 'password') continue
    if (field.type === 'checkbox' || field.type === 'radio') (field as HTMLInputElement).checked = sent.getAll(field.name).includes(field.value)
    else if (typeof sent.get(field.name) === 'string') field.value = sent.get(field.name) as string
  }
}

/**
 * useActionState for a form whose request may get no answer. Such a submit keeps the state the form had instead of
 * throwing into the page's error boundary, the fields get back what was typed, and `unreached` lets UnreachedAlert say so.
 */
export function useFormAction<S>(
  action: (state: Awaited<S>, form: FormData) => Promise<S>,
  initial: Awaited<S>,
  form: RefObject<HTMLFormElement | null>,
): [Awaited<S>, (payload: FormData) => void, boolean, Unreached | null] {
  const [unreached, setUnreached] = useState<Unreached | null>(null)
  const [state, run, pending] = useActionState<S, FormData>(async (previous, sent) => {
    const next = await reach(() => action(previous, sent))
    setUnreached(current => (next === null ? { sent, count: (current?.count ?? 0) + 1 } : null))
    return next ?? previous
  }, initial)

  // React resets a form in the commit that ends its action, the one that turns `pending` off: the fields are filled after it.
  useEffect(() => {
    if (!pending && unreached && form.current) refill(form.current, unreached.sent)
  }, [pending, unreached, form])

  return [state, run, pending, unreached]
}

/** Says that a submit got no answer, once for each such submit. */
export function UnreachedAlert({ unreached, className }: { unreached: Unreached | null; className?: string }) {
  const t = useTranslations('common')
  if (!unreached) return null
  return <ErrorAlert key={unreached.count} className={className}>{t('unreached')}</ErrorAlert>
}
