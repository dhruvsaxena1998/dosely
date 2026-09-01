import type { Adherence } from '@/lib/schedule'

/** Missed shows as a hatched gap rather than a red block. It is an absence, not a fault. */
export function AdherenceBar({ tally }: { tally: Adherence }) {
  if (tally.total === 0) return null
  const segments = [
    { key: 'taken', value: tally.taken, className: 'bg-taken' },
    { key: 'skipped', value: tally.skipped, className: 'bg-skipped' },
    { key: 'missed', value: tally.missed, className: 'hatch' },
    { key: 'pending', value: tally.pending, className: 'bg-border' },
  ]
  return (
    <div className="mt-2.5 flex h-2 w-full gap-px overflow-hidden rounded-[3px] bg-muted">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div key={s.key} className={s.className} style={{ width: `${(s.value / tally.total) * 100}%` }} />
        ))}
    </div>
  )
}
