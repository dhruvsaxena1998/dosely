import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-display text-2xl uppercase">{title}</h1>
          {subtitle ? (
            <p className="type-data mt-1.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  )
}
