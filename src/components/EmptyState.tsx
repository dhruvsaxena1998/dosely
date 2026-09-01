import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
      <div className="pocket pocket-empty flex size-11 items-center justify-center border border-border bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h2 className="type-display mt-1 text-base uppercase">{title}</h2>
      {body ? <p className="max-w-[17rem] text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
      {children ? <div className="mt-3 flex flex-col items-center gap-2">{children}</div> : null}
    </div>
  )
}
