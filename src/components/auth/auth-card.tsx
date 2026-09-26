import type { ReactNode } from 'react'

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-xs sm:p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span aria-hidden className="grid size-7 place-items-center rounded-[7px] bg-primary font-brand text-[17px] font-bold text-primary-foreground">
          F
        </span>
        <span className="font-brand text-base font-bold tracking-tight">Formline Admin</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  )
}
