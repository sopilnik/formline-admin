// What every form's server action reads, whatever the form is about.

/** A text field of a submitted form; '' when it is absent or a file. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** Whole minutes for a "try again in" message, at least one. */
export function retryMinutes(seconds: number | undefined): number | undefined {
  return seconds === undefined ? undefined : Math.max(1, Math.ceil(seconds / 60))
}
