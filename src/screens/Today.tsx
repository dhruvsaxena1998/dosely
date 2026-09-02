import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Pill } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DayStrip } from '@/components/DayStrip'
import { DoseRow } from '@/components/DoseRow'
import { EmptyState } from '@/components/EmptyState'
import { MetaLine } from '@/components/MetaLine'
import { SlotHeading } from '@/components/SlotHeading'
import {
  BACKFILL_DAYS,
  formatDayLong,
  formatWithYear,
  isValidKey,
  maxKey,
  minKey,
  relativeDayLabel,
  shiftKey,
  useToday,
} from '@/lib/dates'
import { loadExamples } from '@/lib/examples'
import { feedback } from '@/lib/feedback'
import type { Dose, SlotAction } from '@/lib/schedule'
import { dosesOn, groupMedicines, scheduleHorizon, slotAction, slotTargets } from '@/lib/schedule'
import { slotLabel, sortSlots, type SlotId } from '@/lib/slots'
import { setDose, setDoses, useDatabase } from '@/lib/store'
import type { DoseState } from '@/types'

export function Today() {
  const db = useDatabase()
  const now = useToday()
  const [date, setDate] = useState(now)
  const [picking, setPicking] = useState(false)
  /** The day it was, last time this screen rendered. */
  const [wasNow, setWasNow] = useState(now)

  const earliest = shiftKey(now, -BACKFILL_DAYS)
  // Walking forward stops where the last course runs out. Past that every day is
  // empty, and an arrow that only ever finds "nothing due" is a lie about depth.
  const latest = useMemo(() => scheduleHorizon(db, now), [db, now])

  // The day can turn over under a window that has been sitting open all night.
  // Follow it if the screen was on today, so the next dose is ticked onto the
  // day it was actually swallowed. Stay put if the user walked somewhere — the
  // screen does not move while it is being read — and only pull them back if
  // the day they were on has just locked.
  if (wasNow !== now) {
    setWasNow(now)
    setDate(date === wasNow ? now : minKey(maxKey(date, earliest), latest))
  }

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
  const planned = date > now

  function goTo(next: string) {
    if (!isValidKey(next)) return
    setDate(minKey(maxKey(next, earliest), latest))
  }

  /**
   * Answering a pocket, and saying so in the hand. The day being complete is
   * worth a fuller answer than a single tick, and it is the one moment in the
   * app that otherwise passes without comment — so it is read here, where every
   * other dose on the day is already known, rather than from the store.
   */
  function answer(dose: Dose, state: DoseState) {
    const clearing = dose.outcome === state
    setDose(dose.group.groupId, date, dose.slot, clearing ? null : state)
    if (clearing) return feedback('dose-cleared')
    feedback(completedBy([dose]) ? 'day-complete' : state === 'skipped' ? 'dose-skipped' : 'dose-taken')
  }

  /**
   * Answering a whole slot. Four things after breakfast is one act, so it is one
   * write, one render and one answer back — a fill that finishes the strip
   * celebrates the day rather than ticking once per dose and then celebrating.
   *
   * What it writes is never simply the slot: filling steps over a dose already
   * answered, and clearing takes back only what it could have put there.
   */
  function answerSlot(slotDoses: Dose[], action: SlotAction) {
    const targets = slotTargets(slotDoses, action)
    // Pressing fill on a slot with nothing left unanswered, which is what the
    // control still offers once a slot holds a skip. Nothing was recorded, so
    // there is nothing to confirm.
    if (targets.length === 0) return
    setDoses(
      date,
      targets.map((d) => ({
        groupId: d.group.groupId,
        slot: d.slot,
        state: action === 'fill' ? ('taken' as const) : null,
      })),
    )
    if (action === 'clear') return feedback('dose-cleared')
    feedback(completedBy(targets) ? 'day-complete' : 'dose-taken')
  }

  /** Whether answering these doses leaves nothing else open on the day. */
  function completedBy(answered: Dose[]): boolean {
    return doses.every((d) => d.entry || answered.includes(d))
  }

  return (
    <div>
      <header className="app-header border-b bg-background px-3 pb-4 pt-3">
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
          <button
            type="button"
            aria-label="Pick a date"
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
            className="flex-1 rounded-lg py-0.5 text-center"
          >
            <h1 className="type-display text-2xl">{relativeDayLabel(date, now)}</h1>
            <MetaLine
              className="mt-1.5 tracking-[0.1em]"
              parts={
                doses.length === 0
                  ? [formatWithYear(date)]
                  : planned
                    ? [formatWithYear(date), `${doses.length} due`]
                    : [formatWithYear(date), left === 0 ? 'All done' : `${left} left`]
              }
            />
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            disabled={date >= latest}
            onClick={() => setDate(shiftKey(date, 1))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        {picking ? (
          <div className="mt-3 flex items-center gap-2 px-1">
            <Input
              type="date"
              aria-label="Date"
              className="h-9"
              value={date}
              min={earliest}
              max={latest}
              onChange={(e) => goTo(e.target.value)}
            />
            <Button variant="outline" size="sm" disabled={date === now} onClick={() => setDate(now)}>
              Today
            </Button>
          </div>
        ) : null}
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
        <EmptyState
          icon={planned ? CalendarDays : CircleCheck}
          title="Nothing due"
          body={`Nothing is scheduled for ${formatDayLong(date)}.`}
        />
      ) : (
        <div className="space-y-7 px-4 py-6">
          {bySlot.map(({ slot, doses: slotDoses }) => {
            // Only where a tick is on offer anyway. A day being read ahead to
            // has nothing to record yet, and a day older than the backfill
            // window cannot be reached from this screen at all, so the rows and
            // the heading lock together by neither of them being drawn.
            const action = planned ? undefined : slotAction(slotDoses)
            return (
              <section key={slot}>
                <SlotHeading
                  label={slotLabel(slot)}
                  done={slotDoses.filter((d) => d.entry).length}
                  total={slotDoses.length}
                  bulk={action ? { action, onPress: () => answerSlot(slotDoses, action) } : undefined}
                />
                <div className="space-y-2">
                  {slotDoses.map((dose) => (
                    <DoseRow
                      key={dose.group.groupId}
                      dose={dose}
                      planned={planned}
                      onToggleTaken={() => answer(dose, 'taken')}
                      onToggleSkipped={() => answer(dose, 'skipped')}
                    />
                  ))}
                </div>
              </section>
            )
          })}
          {planned ? (
            <p className="type-data px-1 text-center text-[11px] text-muted-foreground">
              Planned. You can tick it on the day.
            </p>
          ) : date < now ? (
            <p className="type-data px-1 text-center text-[11px] text-muted-foreground">
              You can go back {BACKFILL_DAYS} days. Anything older is locked.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
