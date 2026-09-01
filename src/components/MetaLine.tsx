import { cn } from '@/lib/utils'

/** Repeat / duration / span, stamped like the print along the edge of a strip. */
export function MetaLine({ parts, className }: { parts: string[]; className?: string }) {
  return (
    <p className={cn('type-data text-[11px] uppercase tracking-[0.08em] text-muted-foreground', className)}>
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? <span className="mx-1.5 opacity-40">/</span> : null}
          <span>{part}</span>
        </span>
      ))}
    </p>
  )
}
