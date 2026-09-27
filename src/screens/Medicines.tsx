import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, Copy, Pill, Plus, Search, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DaySheet } from '@/components/DaySheet'
import { EmptyState } from '@/components/EmptyState'
import { MetaLine } from '@/components/MetaLine'
import { MonthGrid } from '@/components/MonthGrid'
import { PageHeader } from '@/components/PageHeader'
import { courseFill, monthCells, monthOf, monthTally } from '@/lib/calendar'
import { copyText } from '@/lib/clipboard'
import type { DateKey } from '@/lib/dates'
import { maxKey, minKey, relativeDayLabel, shiftKey, useToday } from '@/lib/dates'
import { describeGroupSpan, describeLength, describeRepeat, describeTally } from '@/lib/describe'
import { loadExamples } from '@/lib/examples'
import { FILL_POCKET } from '@/lib/outcome'
import { prescriptionText } from '@/lib/prescription'
import type { Adherence, MedicineGroup } from '@/lib/schedule'
import {
  adherenceFor,
  courseStatus,
  dayTallies,
  dosesOnFor,
  groupMedicines,
  groupSpan,
  nextOpenDate,
} from '@/lib/schedule'
import { slotLabel, sortSlots } from '@/lib/slots'
import { useDatabase } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Database } from '@/types'

/**
 * How many medicines it takes before a search field earns the space it costs.
 * Under this the whole list is one glance and a way to narrow it is chrome; the
 * threshold reads the number of medicines rather than the number matching, so
 * typing cannot take away the field being typed into.
 */
const SEARCH_FROM = 6

/**
 * The two headings a live course can sit under, named once. The list draws them
 * and the copied prescription prints them, so they cannot come apart.
 */
const RUNNING = 'Running'
const NOT_STARTED = 'Not started'

/**
 * The register and the record, on one screen.
 *
 * They were two tabs listing the same courses: one printed a course's adherence
 * as a pocket and offered the buttons, the other printed the same number as a
 * bar and offered the calendar. A medicine appeared twice and neither copy was
 * the whole of it. Here it appears once — the list says what you are on and how
 * each course is going, and a card is the door to that course's own page, which
 * holds its record and its buttons together.
 */
export function Medicines() {
  const db = useDatabase()
  const now = useToday()
  // A lens on the list rather than a setting on it, so both live in view state
  // and both are gone by the time you come back to the screen.
  const [query, setQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)

  const groups = useMemo(() => groupMedicines(db.medicines), [db])
  const needle = query.trim().toLowerCase()

  // Which section a course belongs in, asked once and before anything is typed.
  // The search narrows this rather than replacing it, so the same rule decides
  // what is running whether or not a lens is over the list.
  const sections = useMemo(() => {
    const live = groups.filter((g) => !g.current.deletedAt)
    return {
      active: live.filter((g) => courseStatus(db, g, now) === 'active'),
      upcoming: live.filter((g) => courseStatus(db, g, now) === 'upcoming'),
      archived: groups.filter(
        (g) => g.current.deletedAt || ['finished', 'stopped'].includes(courseStatus(db, g, now)),
      ),
    }
  }, [db, groups, now])

  const { active, upcoming, archived } = useMemo(() => {
    if (!needle) return sections
    // The name only. A hit on a note or a slot label would be a card in the
    // list with nothing on it that matches what was typed.
    const keep = (list: MedicineGroup[]) =>
      list.filter((g) => g.current.name.toLowerCase().includes(needle))
    return { active: keep(sections.active), upcoming: keep(sections.upcoming), archived: keep(sections.archived) }
  }, [sections, needle])

  // Deliberately read off the sections rather than off what the search left
  // showing. A lens is for finding one card; a prescription that quietly
  // dropped half your medicines because something was still typed in the box
  // is the kind of mistake this app exists to prevent.
  const prescription = useMemo(
    () =>
      prescriptionText(
        db,
        [
          { title: RUNNING, groups: sections.active },
          { title: NOT_STARTED, groups: sections.upcoming },
        ],
        now,
      ),
    [db, sections, now],
  )

  const total = groups.length
  const found = active.length + upcoming.length + archived.length

  return (
    <div>
      <PageHeader
        title="Medicines"
        action={
          <div className="flex items-center gap-2">
            {/* Nothing live, nothing to hand anyone. An empty install and a
                shelf of finished courses both leave the press away. */}
            {prescription ? <CopyPrescription text={prescription} /> : null}
            <Button asChild size="sm">
              <Link to="/medicines/new">
                <Plus className="size-4" />
                Add
              </Link>
            </Button>
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={Pill}
          title="No medicines yet"
          body="A medicine needs a name, the slots you take it in, how often it repeats and how long the course runs."
        >
          <Button asChild>
            <Link to="/medicines/new">Add a medicine</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => loadExamples()}>
            Load a sample prescription
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-5 px-4 py-6">
          <Calendar db={db} groups={groups} now={now} />

          {total >= SEARCH_FROM ? (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a medicine"
                placeholder="Find a medicine"
                className="pl-8"
              />
            </div>
          ) : null}

          {needle && found === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing found"
              body={`No medicine here is named like “${query.trim()}”.`}
            >
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                Clear the search
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-8">
              <Section title={RUNNING} groups={active} db={db} now={now} />
              <Section title={NOT_STARTED} groups={upcoming} db={db} now={now} />
              {/* The one section that grows for as long as the app is used, and
                  the only one that folds. Running and Not started are bounded by
                  how many courses you are actually on.

                  A search opens it rather than toggling it: a fold must never be
                  able to swallow the thing being looked for, and clearing the
                  search hands the section back in whatever state it was left. */}
              <Section
                title="Archive"
                groups={archived}
                db={db}
                now={now}
                fold={{ open: archiveOpen || Boolean(needle), onToggle: () => setArchiveOpen(!archiveOpen) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The month of pockets, folded shut with its number showing.
 *
 * It used to be the first thing on a tab of its own, which made a calendar the
 * answer to a screen nobody opened to ask about a calendar. The list is what
 * this screen is for, so the grid waits behind one press — and the press keeps
 * the one number the grid was read for, so the common question is answered
 * without opening anything.
 */
function Calendar({ db, groups, now }: { db: Database; groups: MedicineGroup[]; now: DateKey }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<DateKey>()

  // Deleted courses included. A day you took something is still a day you took
  // it, and a course that has not started has nothing to say about any day yet.
  const counted = useMemo(
    () => groups.filter((g) => courseStatus(db, g, now) !== 'upcoming'),
    [db, groups, now],
  )

  const bounds = useMemo(() => {
    let first = now
    let last = now
    for (const g of counted) {
      const span = groupSpan(db, g, now)
      first = minKey(first, span.start)
      last = maxKey(last, shiftKey(span.end, -1))
    }
    return { first, last }
  }, [db, counted, now])

  const days = useMemo(
    () => dayTallies(db, counted, bounds.first, shiftKey(bounds.last, 1), now),
    [db, counted, bounds, now],
  )
  const thisMonth = useMemo(() => monthTally(days, monthCells(monthOf(now)).days), [days, now])
  const pickedDoses = useMemo(
    () => (picked ? dosesOnFor(db, counted, picked, now) : []),
    [db, counted, picked, now],
  )

  // Nothing has run yet, so a calendar would be a grid of empty days under a
  // heading promising a record.
  if (counted.length === 0) return null

  return (
    <section>
      <h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={
            thisMonth.counted > 0
              ? `This month, ${thisMonth.taken} of ${thisMonth.counted} taken`
              : 'This month, nothing answered yet'
          }
          className="flex w-full items-center gap-3 rounded-lg py-0.5 text-left transition-opacity active:opacity-60"
        >
          <span className="type-eyebrow text-muted-foreground">This month</span>
          <span className="h-px flex-1 bg-border" />
          {/* Nothing has been answered this month, so there is no score to
              print and "0/0" would read as a bad one. */}
          {thisMonth.counted > 0 ? (
            <span className="type-data text-[11px] text-muted-foreground">
              {thisMonth.taken}/{thisMonth.counted}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </h2>
      {open ? (
        <div className="mt-2.5">
          <MonthGrid days={days} first={bounds.first} last={bounds.last} today={now} onPick={setPicked} />
        </div>
      ) : null}
      <DaySheet date={picked} doses={pickedDoses} onClose={() => setPicked(undefined)} />
    </section>
  )
}

/** A fold: whether the section is open, and the press that changes that. */
type Fold = { open: boolean; onToggle: () => void }

function Heading({ children, count, fold }: { children: string; count?: number; fold?: Fold }) {
  const row = (
    <>
      <span className="type-eyebrow text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
      {count === undefined ? null : (
        <span className="type-data text-[11px] text-muted-foreground">{count}</span>
      )}
      {fold ? (
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            fold.open && 'rotate-180',
          )}
        />
      ) : null}
    </>
  )

  if (!fold) return <h2 className="mb-2.5 flex items-center gap-3">{row}</h2>

  // The count is the whole point of a folded section: shut, it is the only thing
  // saying there is anything in there. Said in words as well, because read out
  // the row is a heading and a bare number run together.
  return (
    <h2 className="mb-2">
      <button
        type="button"
        onClick={fold.onToggle}
        aria-expanded={fold.open}
        aria-label={`${children}, ${count} ${count === 1 ? 'medicine' : 'medicines'}`}
        className="flex w-full items-center gap-3 rounded-lg py-0.5 text-left transition-opacity active:opacity-60"
      >
        {row}
      </button>
    </h2>
  )
}

function Section({
  title,
  groups,
  db,
  now,
  fold,
}: {
  title: string
  groups: MedicineGroup[]
  db: Database
  now: DateKey
  /** Absent on a section that does not fold, which is most of them. */
  fold?: Fold
}) {
  // A section with nothing in it says nothing, folded or not. During a search
  // that is what leaves only the sections holding a match.
  if (groups.length === 0) return null
  return (
    <section>
      <Heading count={fold ? groups.length : undefined} fold={fold}>
        {title}
      </Heading>
      {!fold || fold.open ? (
        <div className="space-y-2">
          {groups.map((g) => (
            <MedicineCard key={g.groupId} group={g} db={db} now={now} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** Whether a course has anything behind it worth printing a count of. */
function hasRecord(t: Adherence): boolean {
  return t.taken + t.skipped + t.missed > 0
}

/**
 * What became of the course so far. The taken count wears the theme's confident
 * colour, which is the same colour the pocket beside it is filled with, so the
 * number and the fill are visibly the same fact.
 */
function Tally({ tally }: { tally: Adherence }) {
  return (
    <p className="type-data mt-2 text-[11px] text-muted-foreground">
      <span className={tally.taken > 0 ? 'font-medium text-taken-foreground' : undefined}>
        {tally.taken} taken
      </span>
      {tally.skipped > 0 ? <span> · {tally.skipped} skipped</span> : null}
      {tally.missed > 0 ? <span> · {tally.missed} missed</span> : null}
      <span> of {tally.total}</span>
    </p>
  )
}

function MedicineCard({ group, db, now }: { group: MedicineGroup; db: Database; now: DateKey }) {
  const m = group.current
  const status = courseStatus(db, group, now)
  const deleted = Boolean(m.deletedAt)
  const due = deleted ? undefined : nextOpenDate(db, group, now)
  // Held, because it walks every dose the course ever scheduled and a chronic
  // one entered as ten years is thousands of them. Typing in the search field
  // re-renders every card on the screen, and none of them changed.
  const tally = useMemo(() => adherenceFor(db, group, now), [db, group, now])
  const counted = hasRecord(tally)

  return (
    <article>
      <Link
        to={`/medicines/${group.groupId}`}
        className="surface flex gap-2.5 rounded-xl bg-card p-3.5 transition-colors active:bg-accent/40"
      >
        {/* The card's one pocket, and the only thing on this screen printed in
            the theme's confident colour. How the course is going, in the same
            four steps the month grid uses: filled where it has been taken,
            hatched where it is being missed, recessed where nothing has been
            answered yet. Bauhaus cuts it round, Cyberpunk lights it, and
            Monochrome still tells the four apart.

            Where the count is printed below in words, the pocket is that count
            drawn, so it is left out of the reading rather than said twice. */}
        <span
          role={counted ? undefined : 'img'}
          aria-hidden={counted ? true : undefined}
          aria-label={counted ? undefined : describeTally(tally)}
          className={cn('pocket mt-px size-6 shrink-0', FILL_POCKET[courseFill(tally)])}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{m.name}</h3>
            <span
              className={cn(
                'type-eyebrow shrink-0 rounded-md px-1.5 py-1',
                due === now ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {deleted ? 'Deleted' : status === 'stopped' ? 'Stopped' : due ? `Due ${relativeDayLabel(due, now)}` : 'Done'}
            </span>
            {/* On the title's line rather than down the side of the card: a
                column of its own took a chevron's width off every line below
                it, which is where the dates are and where they wrapped. */}
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          </div>

          <MetaLine
            className="mt-1"
            parts={[
              describeRepeat(m),
              describeLength(db, group, now),
              describeGroupSpan(db, group, now),
            ]}
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sortSlots(m.slots).map((slot) => (
              <span key={slot} className="type-eyebrow rounded-md border px-1.5 py-1 text-muted-foreground">
                {slotLabel(slot)}
              </span>
            ))}
          </div>

          {/* The line the other tab printed under its bar, carried over whole.
              What is left to come is left out of it: the badge above already
              says when the next one falls, and a course is read by how much of
              it has been kept rather than by how much of it is left. */}
          {counted ? <Tally tally={tally} /> : null}

          {m.note ? <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{m.note}</p> : null}
        </div>
      </Link>
    </article>
  )
}

/** How long the button wears its answer before going back to offering the press. */
const COPIED_FOR = 2000

/**
 * The prescription, on the clipboard. The one moment this data leaves the
 * device is somebody asking what you are on, and until now the only answer was
 * a JSON file on the Settings screen, which is not something you can send your
 * mother.
 *
 * The button says what happened rather than raising a toast the app has nowhere
 * to put, and it says it in its own label so the press and the answer are the
 * same object. Refusal is a face it wears too: Safari can deny the clipboard
 * outright, and a button that looks like it worked would be worse than one that
 * admits it did not.
 */
function CopyPrescription({ text }: { text: string }) {
  const [said, setSaid] = useState<'copied' | 'refused'>()
  const clearing = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Nothing to cancel, only a timer that would otherwise set state on a screen
  // that has been walked away from.
  useEffect(() => () => clearTimeout(clearing.current), [])

  async function press() {
    const copied = await copyText(text)
    setSaid(copied ? 'copied' : 'refused')
    clearTimeout(clearing.current)
    clearing.current = setTimeout(() => setSaid(undefined), COPIED_FOR)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={press}>
        {said === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
        {said === 'copied' ? 'Copied' : said === 'refused' ? 'Cannot copy' : 'Copy'}
      </Button>
      {/* The label change is the answer for anyone who can see it. Read out, a
          button whose name quietly changed says nothing at all. */}
      <span role="status" className="sr-only">
        {said === 'copied' ? 'Prescription copied' : said === 'refused' ? 'The clipboard refused' : ''}
      </span>
    </>
  )
}
