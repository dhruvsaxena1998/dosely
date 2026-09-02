import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { AdherenceBar } from '@/components/AdherenceBar'
import { MetaLine } from '@/components/MetaLine'
import { Button } from '@/components/ui/button'
import { formatDay, formatTime, nearDayLabel, useToday } from '@/lib/dates'
import { describeDuration, describeGroupSpan, describeRepeat } from '@/lib/describe'
import { OUTCOME_CHIP, OUTCOME_LABEL } from '@/lib/outcome'
import type { DoseOutcome } from '@/lib/schedule'
import { adherenceFor, doseHistory, groupMedicines, lookupDose } from '@/lib/schedule'
import { slotLabel, type SlotId } from '@/lib/slots'
import { useDatabase } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MedicineHistory() {
  const { groupId } = useParams()
  const db = useDatabase()
  const now = useToday()

  const group = useMemo(
    () => groupMedicines(db.medicines).find((g) => g.groupId === groupId),
    [db, groupId],
  )

  const days = useMemo(() => {
    if (!group) return []
    const byDate = new Map<string, { slot: SlotId; outcome: DoseOutcome; at?: string }[]>()
    // History stops at today. Doses still to come are counted in "Left", not listed.
    for (const { date, slot } of doseHistory(group).filter((d) => d.date <= now)) {
      const entry = lookupDose(db, group.groupId, date, slot)
      const outcome: DoseOutcome = entry ? entry.state : date < now ? 'missed' : 'pending'
      const list = byDate.get(date)
      const item = { slot, outcome, at: entry?.at }
      if (list) list.push(item)
      else byDate.set(date, [item])
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [db, group, now])

  if (!group) {
    return (
      <div className="screen mx-auto w-full max-w-md">
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          That medicine is gone.{' '}
          <Link to="/history" className="underline">
            Back to history
          </Link>
        </div>
      </div>
    )
  }

  const m = group.current
  const tally = adherenceFor(db, group, now)

  return (
    <div className="screen mx-auto w-full max-w-md">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <header className="app-header flex items-center gap-1 border-b bg-background px-2 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/history">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="truncate text-base font-semibold tracking-[-0.01em]">{m.name}</h1>
        </header>

        <div className="px-4 py-5">
          <MetaLine
            parts={[
              describeRepeat(m.repeatEveryDays),
              describeDuration(m.durationValue, m.durationUnit),
              describeGroupSpan(group),
            ]}
          />
          <AdherenceBar tally={tally} />

          <div className="mt-4 grid grid-cols-4 gap-2">
            <Stat label="Taken" value={tally.taken} className="text-taken-foreground" />
            <Stat label="Skipped" value={tally.skipped} className="text-skipped-foreground" />
            <Stat label="Missed" value={tally.missed} className="text-muted-foreground" />
            <Stat label="Left" value={tally.pending} className="text-muted-foreground" />
          </div>

          <ul className="mt-7 space-y-1.5">
            {days.map(([date, items]) => (
              <li key={date} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2">
                <div className="w-[5rem] shrink-0">
                  <div className="type-data text-[11px] font-medium uppercase tracking-[0.06em]">{formatDay(date)}</div>
                  {nearDayLabel(date, now) ? (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{nearDayLabel(date, now)}</div>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {items.map((item) => (
                    <div key={item.slot} className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{slotLabel(item.slot)}</span>
                      <span
                        className={cn(
                          'type-data shrink-0 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.06em]',
                          OUTCOME_CHIP[item.outcome],
                        )}
                      >
                        {OUTCOME_LABEL[item.outcome]}
                        {item.at ? ` ${formatTime(item.at)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-2.5 text-center">
      <div className={cn('type-display text-xl', value === 0 ? 'text-muted-foreground/50' : className)}>{value}</div>
      <div className="type-eyebrow mt-1.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
