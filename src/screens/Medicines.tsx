import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Pill, Plus, RotateCcw, Search, SearchX, Trash2, Undo2 } from 'lucide-react'
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
import { relativeDayLabel, useToday } from '@/lib/dates'
import { describeDuration, describeGroupSpan, describeRepeat } from '@/lib/describe'
import { loadExamples } from '@/lib/examples'
import type { MedicineGroup } from '@/lib/schedule'
import { courseStatus, groupMedicines, nextOpenDate } from '@/lib/schedule'
import { slotLabel, sortSlots } from '@/lib/slots'
import {
  deleteMedicine,
  restoreMedicine,
  resumeMedicine,
  stopMedicine,
  useDatabase,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Database } from '@/types'

type Confirm = { kind: 'stop'; group: MedicineGroup } | { kind: 'delete'; group: MedicineGroup } | null

/**
 * How many medicines it takes before a search field earns the space it costs.
 * Under this the whole list is one glance and a way to narrow it is chrome; the
 * threshold reads the number of medicines rather than the number matching, so
 * typing cannot take away the field being typed into.
 */
const SEARCH_FROM = 6

export function Medicines() {
  const db = useDatabase()
  const now = useToday()
  const [confirm, setConfirm] = useState<Confirm>(null)
  // A lens on the list rather than a setting on it, so both live in view state
  // and both are gone by the time you come back to the screen.
  const [query, setQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)

  const groups = useMemo(() => groupMedicines(db.medicines), [db])
  const needle = query.trim().toLowerCase()

  const { active, upcoming, archived } = useMemo(() => {
    // The name only. A hit on a note or a slot label would be a card in the
    // list with nothing on it that matches what was typed.
    const keep = needle ? groups.filter((g) => g.current.name.toLowerCase().includes(needle)) : groups
    return {
      active: keep.filter((g) => !g.current.deletedAt && courseStatus(g, now) === 'active'),
      upcoming: keep.filter((g) => !g.current.deletedAt && courseStatus(g, now) === 'upcoming'),
      archived: keep.filter(
        (g) => g.current.deletedAt || ['finished', 'stopped'].includes(courseStatus(g, now)),
      ),
    }
  }, [groups, needle, now])

  const total = groups.length
  const found = active.length + upcoming.length + archived.length

  return (
    <div>
      <PageHeader
        title="Medicines"
        action={
          <Button asChild size="sm">
            <Link to="/medicines/new">
              <Plus className="size-4" />
              Add
            </Link>
          </Button>
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
              <Section title="Running" groups={active} db={db} now={now} onConfirm={setConfirm} />
              <Section title="Not started" groups={upcoming} db={db} now={now} onConfirm={setConfirm} />
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
            <AlertDialogTitle>
              {confirm?.kind === 'stop' ? 'Stop this course?' : 'Delete this medicine?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'stop'
                ? `${confirm.group.current.name} stops appearing from today. Anything you already ticked stays in your history.`
                : `${confirm?.group.current.name} disappears from Today and Medicines. Its history is kept, and you can restore it from the archive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'stop') stopMedicine(confirm.group.groupId)
                else deleteMedicine(confirm.group.groupId)
                setConfirm(null)
              }}
            >
              {confirm?.kind === 'stop' ? 'Stop it' : 'Delete'}
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

  return (
    <article className="surface rounded-xl bg-card p-3.5">
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
          describeRepeat(m.repeatEveryDays),
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

      <div className="-mx-1 mt-3 flex flex-wrap items-center gap-1 border-t pt-2">
        {courseActions(group, now).map((action) => (
          <Action key={action} action={action} group={group} onConfirm={onConfirm} />
        ))}
      </div>
    </article>
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
  }
}
