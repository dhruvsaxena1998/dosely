import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Trash2, Undo2 } from 'lucide-react'
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
import type { CourseAction } from '@/lib/actions'
import { courseActions } from '@/lib/actions'
import type { DateKey } from '@/lib/dates'
import type { MedicineGroup } from '@/lib/schedule'
import {
  deleteMedicine,
  finishMedicine,
  purgeMedicine,
  restoreMedicine,
  resumeMedicine,
  stopMedicine,
} from '@/lib/store'
import type { Database } from '@/types'

type ConfirmKind = 'finish' | 'stop' | 'delete' | 'purge'

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
 * Everything a course can be told to do, and the dialogs that ask first.
 *
 * Lives beside the record rather than on the list. A card in a list is a name
 * and how the course is going; deciding to stop it is a decision about the
 * course, and the screen that holds the course is where the whole of it can be
 * seen before anything is pressed.
 */
export function CourseActions({
  group,
  db,
  now,
  onPurged,
}: {
  group: MedicineGroup
  db: Database
  now: DateKey
  /** Called once the medicine and its history are gone, leaving no screen to return to. */
  onPurged?: () => void
}) {
  const [confirm, setConfirm] = useState<ConfirmKind>()
  const asked = confirm ? CONFIRMS[confirm] : undefined

  return (
    <div className="-mx-1 flex flex-wrap items-center gap-1">
      {courseActions(db, group, now).map((action) => (
        <Action key={action} action={action} group={group} onConfirm={setConfirm} />
      ))}

      <AlertDialog open={confirm !== undefined} onOpenChange={(open) => !open && setConfirm(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asked?.title}</AlertDialogTitle>
            <AlertDialogDescription>{asked?.describe(group.current.name)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={asked?.destructive ? 'destructive' : 'default'}
              onClick={() => {
                if (!confirm || !asked) return
                asked.run(group.groupId)
                setConfirm(undefined)
                if (confirm === 'purge') onPurged?.()
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

/**
 * One action, drawn. Which actions a course offers is `courseActions`; this only
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
  onConfirm: (kind: ConfirmKind) => void
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
        <Button size="sm" variant="ghost" onClick={() => onConfirm('finish')}>
          Finish
        </Button>
      )
    case 'stop':
      return (
        <Button size="sm" variant="ghost" onClick={() => onConfirm('stop')}>
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
          onClick={() => onConfirm('delete')}
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
          onClick={() => onConfirm('purge')}
        >
          <Trash2 className="size-3.5" />
          Delete forever
        </Button>
      )
  }
}
