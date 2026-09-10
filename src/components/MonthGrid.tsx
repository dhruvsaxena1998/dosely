import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DayFill } from '@/lib/calendar'
import { clampMonth, dayFill, dayOpens, formatMonth, monthCells, monthOf, shiftMonth } from '@/lib/calendar'
import type { DateKey } from '@/lib/dates'
import { formatDay } from '@/lib/dates'
import type { DayTally } from '@/lib/schedule'
import { WEEKDAYS } from '@/lib/weekdays'
import { cn } from '@/lib/utils'

/**
 * How each fill is drawn. Only taken gets the theme's confident colour, in
 * three strengths; missed is the hatch; skipped its own colour; the rest are
 * recessed. The steps are fixed rather than a ramp so that Monochrome and
 * Newsprint keep them apart with no hue at all.
 */
const FILL: Record<DayFill, string> = {
  none: 'border-transparent bg-transparent',
  pending: 'border-border/70 bg-muted pocket-empty',
  missed: 'border-border/70 hatch',
  skipped: 'pocket-filled [--glow-tint:var(--skipped)] border-skipped bg-skipped text-skipped-contrast',
  low: 'border-taken/40 bg-taken/25',
  high: 'border-taken/70 bg-taken/55',
  full: 'pocket-filled border-taken bg-taken text-taken-contrast',
}

function describeTally(t: DayTally): string {
  const parts: string[] = []
  if (t.taken) parts.push(`${t.taken} taken`)
  if (t.skipped) parts.push(`${t.skipped} skipped`)
  if (t.missed) parts.push(`${t.missed} missed`)
  if (t.pending) parts.push(`${t.pending} due`)
  return `${parts.join(', ')} of ${t.scheduled}`
}

/**
 * A month of pockets, one per day. The blister strip answers how today is
 * going; this answers how the month went, in the same language. Fill is how
 * much of the day was taken, and a press on any day that has anything behind
 * it opens the day.
 */
export function MonthGrid({
  days,
  first,
  last,
  today,
  onPick,
}: {
  /** Every day with something scheduled, from `dayTallies`. */
  days: Map<DateKey, DayTally>
  /** The first and last days the grid may walk to. */
  first: DateKey
  last: DateKey
  today: DateKey
  onPick: (date: DateKey) => void
}) {
  const firstMonth = monthOf(first)
  const lastMonth = monthOf(last)
  const [month, setMonth] = useState(() => clampMonth(monthOf(today), firstMonth, lastMonth))
  const { lead, days: dates } = useMemo(() => monthCells(month), [month])

  const tally = useMemo(() => {
    let taken = 0
    let counted = 0
    for (const date of dates) {
      const t = days.get(date)
      if (!t) continue
      taken += t.taken
      counted += t.taken + t.missed
    }
    return { taken, counted }
  }, [dates, days])

  return (
    <section aria-label="Calendar" className="surface rounded-xl border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="type-display truncate text-sm uppercase">{formatMonth(month)}</h3>
          <p className="type-data mt-0.5 text-[11px] text-muted-foreground">
            {tally.counted === 0 ? 'Nothing answered yet' : `${tally.taken} of ${tally.counted} taken`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            disabled={month <= firstMonth}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={month >= lastMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d.id} className="type-eyebrow text-center text-[9px] text-muted-foreground">
            {d.short.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {dates.map((date) => {
          const t = days.get(date)
          const fill = t ? dayFill(t) : 'none'
          const label = `${formatDay(date)}${t ? `: ${describeTally(t)}` : ''}`
          const className = cn(
            'pocket relative flex aspect-square items-start justify-start p-1 text-[10px] leading-none',
            'type-data',
            FILL[fill],
            fill === 'none' || fill === 'pending' || fill === 'missed' ? 'text-muted-foreground' : undefined,
            date === today && 'outline-2 outline-offset-1 outline-foreground/50',
          )
          const number = Number(date.slice(8, 10))
          return dayOpens(t) ? (
            <button
              key={date}
              type="button"
              aria-label={label}
              onClick={() => onPick(date)}
              className={cn(className, 'active:translate-y-px')}
            >
              {number}
            </button>
          ) : (
            <span key={date} role="img" aria-label={label} className={className}>
              {number}
            </span>
          )
        })}
      </div>
    </section>
  )
}
