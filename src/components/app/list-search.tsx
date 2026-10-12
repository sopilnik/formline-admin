'use client'

import { Search } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { hiddenFields } from '@/lib/list-filters'

const SEARCH_DELAY_MS = 300

type Props = {
  /** The field's id, which its label names. */
  id: string
  /** The list's path, where the form goes without scripts. */
  action: string
  label: string
  placeholder: string
  /** The search the URL holds. */
  q: string
  /** The list's URL without the search: its other filters and its sort travel as hidden fields. */
  restHref: string
  onSearch: (q: string) => void
}

/** A list's search field: it searches 300 ms after the last keystroke or at once on Enter, and without scripts as a form. */
export function ListSearch({ id, action, label, placeholder, q, restHref, onSearch }: Props) {
  const [draft, setDraft] = useState<{ text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sentQ = useRef(q)

  const send = (text: string): void => {
    sentQ.current = text
    onSearch(text)
  }

  const search = useEffectEvent((text: string) => send(text.trim()))
  useEffect(() => {
    if (draft === null) return
    const timer = setTimeout(() => search(draft.text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    // A search changed from outside the field (Back, "Clear filters") is written into it; the
    // field's own searches are not, so text typed while a search loads is never overwritten.
    if (q !== sentQ.current && input.current) input.current.value = q
    sentQ.current = q
  }, [q])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setDraft(null)
    send((input.current?.value ?? '').trim())
  }

  return (
    <form role="search" action={action} method="get" onSubmit={submit} className="relative w-full md:w-[300px]">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={input}
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        defaultValue={q}
        placeholder={placeholder}
        onChange={event => setDraft({ text: event.target.value })}
        className="h-8 bg-card pl-9"
      />
      {hiddenFields(restHref).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    </form>
  )
}
