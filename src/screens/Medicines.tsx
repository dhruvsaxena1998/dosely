import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pill, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { EmptyState } from '@/components/EmptyState'
import { MetaLine } from '@/components/MetaLine'
import { PageHeader } from '@/components/PageHeader'
import { relativeDayLabel, today } from '@/lib/dates'
import { describeDuration, describeGroupSpan, describeRepeat } from '@/lib/describe'
import { loadExamples } from '@/lib/examples'
import type { MedicineGroup } from '@/lib/schedule'
import { courseStatus, groupMedicines, nextOpenDate } from '@/lib/schedule'
import { slotLabel, sortSlots } from '@/lib/slots'
import {
  deleteMedicine,
  restartMedicine,
  restoreMedicine,
  stopMedicine,
  useDatabase,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Database } from '@/types'

type Confirm = { kind: 'stop'; group: MedicineGroup } | { kind: 'delete'; group: MedicineGroup } | null

export function Medicines() {
  const db = useDatabase()
  const now = today()
  const [confirm, setConfirm] = useState<Confirm>(null)

  const { active, upcoming, archived } = useMemo(() => {
    const groups = groupMedicines(db.medicines)
    return {
      active: groups.filter((g) => !g.current.deletedAt && courseStatus(g, now) === 'active'),
      upcoming: groups.filter((g) => !g.current.deletedAt && courseStatus(g, now) === 'upcoming'),
      archived: groups.filter(
        (g) => g.current.deletedAt || ['finished', 'stopped'].includes(courseStatus(g, now)),
      ),
    }
  }, [db, now])

  const total = active.length + upcoming.length + archived.length

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
        <div className="space-y-8 px-4 py-6">
          <Section title="Running" groups={active} db={db} now={now} onConfirm={setConfirm} />
          <Section title="Not started" groups={upcoming} db={db} now={now} onConfirm={setConfirm} />
          <Section title="Archive" groups={archived} db={db} now={now} onConfirm={setConfirm} />
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

function Heading({ children }: { children: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="type-eyebrow text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function Section({
  title,
  groups,
  db,
  now,
  onConfirm,
}: {
  title: string
  groups: MedicineGroup[]
  db: Database
  now: string
  onConfirm: (c: Confirm) => void
}) {
  if (groups.length === 0) return null
  return (
    <section>
      <Heading>{title}</Heading>
      <div className="space-y-2">
        {groups.map((g) => (
          <MedicineCard key={g.groupId} group={g} db={db} now={now} onConfirm={onConfirm} />
        ))}
      </div>
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
        {deleted ? (
          <Button size="sm" variant="ghost" onClick={() => restoreMedicine(group.groupId)}>
            <RotateCcw className="size-3.5" />
            Restore
          </Button>
        ) : status === 'active' || status === 'upcoming' ? (
          <>
            <Button asChild size="sm" variant="ghost">
              <Link to={`/medicines/${group.groupId}/edit`}>Edit</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm({ kind: 'stop', group })}>
              Stop
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => restartMedicine(group.groupId, now)}>
            <RotateCcw className="size-3.5" />
            Start again
          </Button>
        )}
        {deleted ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => onConfirm({ kind: 'delete', group })}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        )}
      </div>
    </article>
  )
}
