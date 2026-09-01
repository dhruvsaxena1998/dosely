/** Tracked caps, a hairline, and the tally. The rule earns its place by carrying the count. */
export function SlotHeading({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="type-eyebrow text-muted-foreground">{label}</h2>
      <span className="h-px flex-1 bg-border" />
      <span className="type-data text-[11px] text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  )
}
