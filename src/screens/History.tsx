import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, History as HistoryIcon } from 'lucide-react'
import { AdherenceBar } from '@/components/AdherenceBar'
import { DaySheet } from '@/components/DaySheet'
import { EmptyState } from '@/components/EmptyState'
import { MonthGrid } from '@/components/MonthGrid'
import { PageHeader } from '@/components/PageHeader'
import type { DateKey } from '@/lib/dates'
import { maxKey, minKey, shiftKey, useToday } from '@/lib/dates'
import { describeGroupSpan } from '@/lib/describe'
import { adherenceFor, courseStatus, dayTallies, dosesOnFor, groupMedicines, groupSpan } from '@/lib/schedule'
import { useDatabase } from '@/lib/store'

export function History() {
  const db = useDatabase()
  const now = useToday()

  const rows = useMemo(() => {
    return groupMedicines(db.medicines)
      .filter((g) => courseStatus(g, now) !== 'upcoming')
      .map((g) => ({ group: g, tally: adherenceFor(db, g, now) }))
      .sort((a, b) => (a.group.current.name < b.group.current.name ? -1 : 1))
  }, [db, now])

  // The grid reads the same courses the list does, deleted ones included. A
  // day you took something is still a day you took it.
  const groups = useMemo(() => rows.map((r) => r.group), [rows])
  const bounds = useMemo(() => {
    let first = now
    let last = now
    for (const g of groups) {
      const span = groupSpan(g)
      first = minKey(first, span.start)
      last = maxKey(last, shiftKey(span.end, -1))
    }
    return { first, last }
  }, [groups, now])
  const days = useMemo(
    () => dayTallies(db, groups, bounds.first, shiftKey(bounds.last, 1), now),
    [db, groups, bounds, now],
  )
  const [picked, setPicked] = useState<DateKey>()
  const pickedDoses = useMemo(() => (picked ? dosesOnFor(db, groups, picked, now) : []), [db, groups, picked, now])

  return (
    <div>
      <PageHeader title="History" subtitle="What you actually took" />
      {rows.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No history yet" body="Once a course starts, its record shows up here." />
      ) : (
        <div className="space-y-2 px-4 py-6">
          <div className="mb-4">
            <MonthGrid days={days} first={bounds.first} last={bounds.last} today={now} onPick={setPicked} />
          </div>
          <DaySheet date={picked} doses={pickedDoses} onClose={() => setPicked(undefined)} />
          {rows.map(({ group, tally }) => (
            <Link
              key={group.groupId}
              to={`/history/${group.groupId}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors active:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{group.current.name}</h3>
                <p className="type-data mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {describeGroupSpan(group)}
                </p>
                <AdherenceBar tally={tally} />
                <p className="type-data mt-2 text-[11px] text-muted-foreground">
                  <span className={tally.taken > 0 ? 'font-medium text-taken-foreground' : undefined}>{tally.taken} taken</span>
                  {tally.skipped > 0 ? <span> · {tally.skipped} skipped</span> : null}
                  {tally.missed > 0 ? <span> · {tally.missed} missed</span> : null}
                  <span> of {tally.total}</span>
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
