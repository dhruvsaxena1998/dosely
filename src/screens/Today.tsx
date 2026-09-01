import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleCheck, Pill } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DayStrip } from '@/components/DayStrip'
import { DoseRow } from '@/components/DoseRow'
import { EmptyState } from '@/components/EmptyState'
import { MetaLine } from '@/components/MetaLine'
import { SlotHeading } from '@/components/SlotHeading'
import { BACKFILL_DAYS, formatDayLong, formatWithYear, relativeDayLabel, shiftKey, today } from '@/lib/dates'
import { loadExamples } from '@/lib/examples'
import { dosesOn, groupMedicines } from '@/lib/schedule'
import { slotLabel, sortSlots, type SlotId } from '@/lib/slots'
import { setDose, useDatabase } from '@/lib/store'

export function Today() {
  const db = useDatabase()
  const now = today()
  const [date, setDate] = useState(now)

  const doses = useMemo(() => dosesOn(db, date, now), [db, date, now])
  const hasMedicines = groupMedicines(db.medicines).length > 0

  const bySlot = useMemo(() => {
    const map = new Map<SlotId, typeof doses>()
    for (const dose of doses) {
      const list = map.get(dose.slot)
      if (list) list.push(dose)
      else map.set(dose.slot, [dose])
    }
    return sortSlots([...map.keys()]).map((slot) => ({ slot, doses: map.get(slot)! }))
  }, [doses])

  const left = doses.filter((d) => !d.entry).length
  const earliest = shiftKey(now, -BACKFILL_DAYS)

  return (
    <div>
      <header className="sticky top-0 z-10 border-b bg-background px-3 pb-4 pt-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            disabled={date <= earliest}
            onClick={() => setDate(shiftKey(date, -1))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="type-display text-2xl">{relativeDayLabel(date, now)}</h1>
            <MetaLine
              className="mt-1.5 tracking-[0.1em]"
              parts={
                doses.length > 0
                  ? [formatWithYear(date), left === 0 ? 'All done' : `${left} left`]
                  : [formatWithYear(date)]
              }
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            disabled={date >= now}
            onClick={() => setDate(shiftKey(date, 1))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        {doses.length > 0 ? (
          <div className="mt-3 px-1">
            <DayStrip doses={doses} />
          </div>
        ) : null}
      </header>

      {!hasMedicines ? (
        <EmptyState
          icon={Pill}
          title="No medicines yet"
          body="Add what you have been prescribed. It shows up here on the days it is due."
        >
          <Button asChild>
            <Link to="/medicines/new">Add a medicine</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => loadExamples()}>
            Load a sample prescription
          </Button>
        </EmptyState>
      ) : doses.length === 0 ? (
        <EmptyState icon={CircleCheck} title="Nothing due" body={`Nothing is scheduled for ${formatDayLong(date)}.`} />
      ) : (
        <div className="space-y-7 px-4 py-6">
          {bySlot.map(({ slot, doses: slotDoses }) => (
            <section key={slot}>
              <SlotHeading
                label={slotLabel(slot)}
                done={slotDoses.filter((d) => d.entry).length}
                total={slotDoses.length}
              />
              <div className="space-y-2">
                {slotDoses.map((dose) => (
                  <DoseRow
                    key={dose.group.groupId}
                    dose={dose}
                    onToggleTaken={() =>
                      setDose(dose.group.groupId, date, slot, dose.outcome === 'taken' ? null : 'taken')
                    }
                    onToggleSkipped={() =>
                      setDose(dose.group.groupId, date, slot, dose.outcome === 'skipped' ? null : 'skipped')
                    }
                  />
                ))}
              </div>
            </section>
          ))}
          {date < now ? (
            <p className="type-data px-1 text-center text-[11px] text-muted-foreground">
              You can go back {BACKFILL_DAYS} days. Anything older is locked.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
