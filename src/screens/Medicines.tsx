import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Copy, Pill, Plus, RotateCcw, Search, SearchX, Trash2, Undo2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { MetaLine } from '@/components/MetaLine'
import { PageHeader } from '@/components/PageHeader'
import type { CourseAction } from '@/lib/actions'
import { courseActions } from '@/lib/actions'
import { courseFill } from '@/lib/calendar'
import { copyText } from '@/lib/clipboard'
import { relativeDayLabel, useToday } from '@/lib/dates'
import { describeDuration, describeGroupSpan, describeRepeat, describeTally } from '@/lib/describe'
import { loadExamples } from '@/lib/examples'
import { FILL_POCKET } from '@/lib/outcome'
import { prescriptionText } from '@/lib/prescription'
import type { MedicineGroup } from '@/lib/schedule'
import { adherenceFor, courseStatus, groupMedicines, nextOpenDate } from '@/lib/schedule'
import { slotLabel, sortSlots } from '@/lib/slots'
import {
  deleteMedicine,
  finishMedicine,
  purgeMedicine,
  restoreMedicine,
  resumeMedicine,
  stopMedicine,
  useDatabase,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Database } from '@/types'

type ConfirmKind = 'finish' | 'stop' | 'delete' | 'purge'

type Confirm = { kind: ConfirmKind; group: MedicineGroup } | null

/**
 * What each confirmation asks, and what it runs when the answer is yes.
 *
 * One row per press rather than a ternary per line. The four differ in their
 * title, their sentence, their button and the call behind it, and four separate
 * chains answering the same question are four chances to pair the wrong ones.
 */
const CONFIRMS: Record<
  ConfirmKind,
  {
    title: string
    describe: (name: string) => string
    action: string
    destructive?: boolean
    run: (groupId: string) => void
  }
> = {
  // The difference from Stop is one day, so the sentence is about that day.
  finish: {
    title: 'Finish this course?',
    describe: (name) =>
      `${name} ends with today. Today's doses are still yours to tick, and the days after it drop off. It counts as completed rather than cut short.`,
    action: 'Finish it',
    run: finishMedicine,
  },
  stop: {
    title: 'Stop this course?',
    describe: (name) =>
      `${name} stops appearing from today. Anything you already ticked stays in your history.`,
    action: 'Stop it',
    run: stopMedicine,
  },
  delete: {
    title: 'Delete this medicine?',
    describe: (name) =>
      `${name} disappears from Today and Medicines. Its history is kept, and you can restore it from the archive.`,
    action: 'Delete',
    run: deleteMedicine,
  },
  purge: {
    title: 'Delete forever?',
    describe: (name) =>
      `${name} and its whole history — every tick, skip and miss — are removed for good. This cannot be undone.`,
    action: 'Delete forever',
    destructive: true,
    run: purgeMedicine,
  },
}

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

export function Medicines() {
  const db = useDatabase()
  const now = useToday()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const asked = confirm ? CONFIRMS[confirm.kind] : undefined
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
      active: live.filter((g) => courseStatus(g, now) === 'active'),
      upcoming: live.filter((g) => courseStatus(g, now) === 'upcoming'),
      archived: groups.filter(
        (g) => g.current.deletedAt || ['finished', 'stopped'].includes(courseStatus(g, now)),
      ),
    }
  }, [groups, now])

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
        [
          { title: RUNNING, groups: sections.active },
          { title: NOT_STARTED, groups: sections.upcoming },
        ],
        now,
      ),
    [sections, now],
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
              body={`No medicine here is named like \u201c${query.trim()}\u201d.`}
            >
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                Clear the search
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-8">
              <Section title={RUNNING} groups={active} db={db} now={now} onConfirm={setConfirm} />
              <Section title={NOT_STARTED} groups={upcoming} db={db} now={now} onConfirm={setConfirm} />
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
                onConfirm={setConfirm}
                fold={{ open: archiveOpen || Boolean(needle), onToggle: () => setArchiveOpen(!archiveOpen) }}
              />
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asked?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && asked ? asked.describe(confirm.group.current.name) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={asked?.destructive ? 'destructive' : 'default'}
              onClick={() => {
                if (!confirm || !asked) return
                asked.run(confirm.group.groupId)
                setConfirm(null)
              }}
            >
              {asked?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  onConfirm,
  fold,
}: {
  title: string
  groups: MedicineGroup[]
  db: Database
  now: string
  onConfirm: (c: Confirm) => void
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
            <MedicineCard key={g.groupId} group={g} db={db} now={now} onConfirm={onConfirm} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function MedicineCard({
  group,
  db,
  now,
  onConfirm,
}: {
  group: MedicineGroup
  db: Database
  now: string
  onConfirm: (c: Confirm) => void
}) {
  const m = group.current
  const status = courseStatus(group, now)
  const deleted = Boolean(m.deletedAt)
  const due = deleted ? undefined : nextOpenDate(db, group, now)
  // Held, because it walks every dose the course ever scheduled and a chronic
  // one entered as ten years is thousands of them. Typing in the search field
  // re-renders every card on the screen, and none of them changed.
  const tally = useMemo(() => adherenceFor(db, group, now), [db, group, now])

  return (
    <article className="surface rounded-xl bg-card p-3.5">
      <div className="flex gap-2.5">
        {/* The card's one pocket, and the only thing on this screen printed in
            the theme's confident colour. How the course is going, in the same
            four steps the month grid uses: filled where it has been taken,
            hatched where it is being missed, recessed where nothing has been
            answered yet. Bauhaus cuts it round, Cyberpunk lights it, and
            Monochrome still tells the four apart. */}
        <span
          role="img"
          aria-label={describeTally(tally)}
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
          </div>

          <MetaLine
            className="mt-1"
            parts={[
              describeRepeat(m),
              describeDuration(m.durationValue, m.durationUnit),
              describeGroupSpan(group),
            ]}
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sortSlots(m.slots).map((slot) => (
              <span key={slot} className="type-eyebrow rounded-md border px-1.5 py-1 text-muted-foreground">
                {slotLabel(slot)}
              </span>
            ))}
          </div>

          {m.note ? <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{m.note}</p> : null}
        </div>
      </div>

      <div className="-mx-1 mt-3 flex flex-wrap items-center gap-1 border-t pt-2">
        {courseActions(group, now).map((action) => (
          <Action key={action} action={action} group={group} onConfirm={onConfirm} />
        ))}
      </div>
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

/**
 * One action, drawn. Which actions a card offers is `courseActions`; this only
 * knows how each one looks and what it calls, so the two cannot disagree about
 * when a button should be there.
 */
function Action({
  action,
  group,
  onConfirm,
}: {
  action: CourseAction
  group: MedicineGroup
  onConfirm: (c: Confirm) => void
}) {
  switch (action) {
    case 'edit':
      return (
        <Button asChild size="sm" variant="ghost">
          <Link to={`/medicines/${group.groupId}/edit`}>Edit</Link>
        </Button>
      )
    // Two ways out of a course under way, side by side, because which one it was
    // is the difference between a record that reads as completed and one that
    // reads as abandoned.
    case 'finish':
      return (
        <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: 'finish', group })}>
          Finish
        </Button>
      )
    case 'stop':
      return (
        <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: 'stop', group })}>
          Stop
        </Button>
      )
    // No dialog. A resume adds days back rather than taking any away, and
    // stopping again is right there — the two things a confirmation is for.
    case 'resume':
      return (
        <Button size="sm" variant="ghost" onClick={() => resumeMedicine(group.groupId)}>
          <Undo2 className="size-3.5" />
          Resume
        </Button>
      )
    // Navigation, not a mutation. A repeat prescription is usually a different
    // length and rarely starts on the day you happened to tap, so it opens the
    // add form carrying this course's details rather than guessing at both.
    case 'restart':
      return (
        <Button asChild size="sm" variant="ghost">
          <Link to={`/medicines/new?from=${group.groupId}`}>
            <RotateCcw className="size-3.5" />
            Start again
          </Link>
        </Button>
      )
    case 'restore':
      return (
        <Button size="sm" variant="ghost" onClick={() => restoreMedicine(group.groupId)}>
          <RotateCcw className="size-3.5" />
          Restore
        </Button>
      )
    case 'delete':
      return (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-muted-foreground"
          onClick={() => onConfirm({ kind: 'delete', group })}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      )
    // The delete behind the delete, offered once the medicine is already in the
    // archive. Takes the history with it, so it asks twice — here and in the
    // dialog — and lands in destructive colours both times.
    case 'purge':
      return (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive"
          onClick={() => onConfirm({ kind: 'purge', group })}
        >
          <Trash2 className="size-3.5" />
          Delete forever
        </Button>
      )
  }
}
