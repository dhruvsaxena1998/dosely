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
  const detail = dose.entry
    ? { text: `${isSkipped ? 'Skipped' : 'Taken'} at ${formatTime(dose.entry.at)}`, className: 'type-data text-muted-foreground' }
    : dose.outcome === 'missed'
      ? { text: 'Missed', className: 'type-data text-missed-foreground' }
      : dose.note
        ? { text: dose.note, className: 'text-muted-foreground' }
        : { text: undefined, className: undefined }

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
      <span className="min-w-0">
        {/* The line box is the pocket's own height, so the name and the pocket
            centre on each other whatever the type is doing. Centring the pocket
            against the whole text block instead would hang it half a line below
            the name on the rows that have nothing to say yet — which is most of
            them, most of the day. */}
        <span
          className={cn(
            'block truncate text-[15px] font-medium leading-7 tracking-[-0.005em]',
            isSkipped && 'text-muted-foreground',
            dose.outcome === 'missed' && 'text-muted-foreground',
          )}
        >
          {dose.name}
        </span>
        {/* Always drawn, blank when there is nothing to say yet. Ticking a dose
            fills this line in, and a line that only exists once it has text
            would grow the row out from under the thumb that just pressed it. */}
        <span className={cn('block h-[15px] truncate text-[11px] leading-[15px]', detail.className)}>
          {detail.text ?? '\u00a0'}
        </span>
      </span>
    </>
  )

  if (planned) {
    return (
      <div className={cn('surface flex items-stretch rounded-xl', OUTCOME_ROW[dose.outcome])}>
        <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">{body}</div>
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
        className="group flex min-w-0 flex-1 items-start gap-3 rounded-l-xl px-3 py-3 text-left"
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
