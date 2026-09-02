import { Check, CircleSlash2, Minus, Undo2 } from 'lucide-react'
import { formatTime } from '@/lib/dates'
import { OUTCOME_POCKET, OUTCOME_ROW } from '@/lib/outcome'
import type { Dose } from '@/lib/schedule'
import { cn } from '@/lib/utils'

export function DoseRow({
  dose,
  onToggleTaken,
  onToggleSkipped,
  /** A dose on a day that has not arrived. There is nothing to tick yet, so the
      row reads rather than presses, and the skip column goes away with it. */
  planned = false,
}: {
  dose: Dose
  onToggleTaken: () => void
  onToggleSkipped: () => void
  planned?: boolean
}) {
  const isTaken = dose.outcome === 'taken'
  const isSkipped = dose.outcome === 'skipped'
  /** The second line, or nothing to say yet. */
  const detail = dose.entry
    ? { text: `${isSkipped ? 'Skipped' : 'Taken'} at ${formatTime(dose.entry.at)}`, className: 'type-data text-muted-foreground' }
    : dose.outcome === 'missed'
      ? { text: 'Missed', className: 'type-data text-missed-foreground' }
      : dose.note
        ? { text: dose.note, className: 'text-muted-foreground' }
        : undefined

  const body = (
    <>
      <span
        className={cn(
          'pocket flex size-7 shrink-0 items-center justify-center',
          !planned && 'group-active:scale-[0.86]',
          OUTCOME_POCKET[dose.outcome],
        )}
      >
        {isSkipped ? (
          <Minus className="size-3.5" strokeWidth={3} />
        ) : (
          <Check className="size-4" strokeWidth={3} />
        )}
      </span>
      {/* Two lines tall whether or not there is a second line to draw: 24px for
          the name's line box and 15px for the detail's. Ticking a dose fills
          that line in, and a block that grew with it would resize the row under
          the thumb that just pressed it.

          Holding the height here rather than drawing a blank line into it
          leaves what can actually be seen free to sit in the middle of it. A
          name on its own centres against the pocket beside it; a name with a
          detail under it centres the pair, which is how any other two-line row
          with something in the margin is set. Reserving the line as content
          instead put the pocket half a line below the name on every row with
          nothing to say — which is most of them, most of the day. */}
      <span className="flex h-[39px] min-w-0 flex-col justify-center">
        <span
          className={cn(
            'block truncate text-[15px] font-medium leading-6 tracking-[-0.005em]',
            isSkipped && 'text-muted-foreground',
            dose.outcome === 'missed' && 'text-muted-foreground',
          )}
        >
          {dose.name}
        </span>
        {detail ? (
          <span className={cn('block h-[15px] truncate text-[11px] leading-[15px]', detail.className)}>
            {detail.text}
          </span>
        ) : null}
      </span>
    </>
  )

  if (planned) {
    return (
      <div className={cn('surface flex items-stretch rounded-xl', OUTCOME_ROW[dose.outcome])}>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5">{body}</div>
      </div>
    )
  }

  return (
    <div className={cn('surface flex items-stretch rounded-xl transition-colors', OUTCOME_ROW[dose.outcome])}>
      <button
        type="button"
        onClick={onToggleTaken}
        aria-pressed={isTaken}
        aria-label={dose.name}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-3.5 text-left"
      >
        {body}
      </button>
      <button
        type="button"
        onClick={onToggleSkipped}
        aria-pressed={isSkipped}
        aria-label={isSkipped ? `Un-skip ${dose.name}` : `Skip ${dose.name}`}
        className={cn(
          'flex w-11 shrink-0 items-center justify-center rounded-r-xl border-l-[length:var(--border-weight)] text-muted-foreground/60 transition-colors active:opacity-60',
          isSkipped ? 'border-rule-skipped text-skipped-foreground' : 'border-border/60',
        )}
      >
        {isSkipped ? <Undo2 className="size-3.5" /> : <CircleSlash2 className="size-3.5" />}
      </button>
    </div>
  )
}
