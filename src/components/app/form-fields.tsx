'use client'

import { ChevronDown } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Common = { id: string; name: string; label: string; hint?: string; error?: string }

const describedBy = (id: string, hint?: string, error?: string): string | undefined =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

function Messages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-sm text-destructive">{error}</p> : null}
    </>
  )
}

/** A labelled input with its hint and its error, both announced with the field. */
export function TextField({ id, label, hint, error, ...input }: Common & ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}

/**
 * A native select with its label, hint and error, in the inputs' look: it opens the system picker on phones.
 * React resets a form after every action result, and a select then returns to the option that was its default
 * when it mounted — a later default value is not written back. Keyed by its default value, the select mounts
 * again with the choice an error brings back, so the choice is not lost.
 */
export function SelectField({ id, label, hint, error, children, className, ...select }: Common & ComponentProps<'select'> & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          key={String(select.defaultValue ?? '')}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            'h-8 w-full appearance-none truncate rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-base outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive md:text-sm [&>option]:bg-card [&>option]:text-foreground',
            className,
          )}
          {...select}
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}

/** A textarea with its label, hint and error, announced with the field. */
export function TextAreaField({ id, label, hint, error, className, ...area }: Common & ComponentProps<'textarea'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(
          'w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive md:text-sm',
          className,
        )}
        {...area}
      />
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}
