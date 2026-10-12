// What every detail page draws the same way: the link back to its list, its cards, and its "not found".
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/** A detail page's card, and the title at its top. */
export const CARD = 'flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5'
export const CARD_TITLE = 'font-sans text-[15px] font-semibold'

/** The link above a detail page's title, back to its list. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-ink-2 hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </Link>
  )
}

/** "Not found" inside the frame: what is missing, and the way to a list. */
export function DetailNotFound({ title, body, href, link }: { title: string; body: string; href: string; link: string }) {
  return (
    <div className="flex max-w-md flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      <Link href={href} className="text-[13px] font-medium text-primary hover:underline">{link}</Link>
    </div>
  )
}
