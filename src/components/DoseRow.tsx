import { Check, CircleSlash2, Minus, Undo2 } from 'lucide-react'
import { formatTime } from '@/lib/dates'
import { OUTCOME_POCKET, OUTCOME_ROW } from '@/lib/outcome'
import type { Dose } from '@/lib/schedule'
import { cn } from '@/lib/utils'

export function DoseRow({
  dose,
  onToggleTaken,
  onToggleSkipped,
}: {
  dose: Dose
  onToggleTaken: () => void
  onToggleSkipped: () => void
}) {
  const isTaken = dose.outcome === 'taken'
  const isSkipped = dose.outcome === 'skipped'

  return (
    <div className={cn('flex items-stretch rounded-xl border transition-colors', OUTCOME_ROW[dose.outcome])}>
      <button
        type="button"
        onClick={onToggleTaken}
        aria-pressed={isTaken}
        aria-label={dose.name}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-3.5 text-left"
      >
        <span
          className={cn(
            'pocket flex size-7 shrink-0 items-center justify-center border group-active:scale-[0.86]',
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
          <span
            className={cn(
              'block truncate text-[15px] font-medium tracking-[-0.005em]',
              isSkipped && 'text-muted-foreground',
              dose.outcome === 'missed' && 'text-muted-foreground',
            )}
          >
            {dose.name}
          </span>
          {dose.entry ? (
            <span className="type-data mt-0.5 block text-[11px] text-muted-foreground">
              {isSkipped ? 'Skipped' : 'Taken'} at {formatTime(dose.entry.at)}
            </span>
          ) : dose.outcome === 'missed' ? (
            <span className="type-data mt-0.5 block text-[11px] text-missed-foreground">Missed</span>
          ) : dose.note ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{dose.note}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleSkipped}
        aria-pressed={isSkipped}
        aria-label={isSkipped ? `Un-skip ${dose.name}` : `Skip ${dose.name}`}
        className={cn(
          'flex w-11 shrink-0 items-center justify-center rounded-r-xl border-l text-muted-foreground/60 transition-colors active:opacity-60',
          isSkipped ? 'border-skipped/35 text-skipped-foreground' : 'border-border/60',
        )}
      >
        {isSkipped ? <Undo2 className="size-3.5" /> : <CircleSlash2 className="size-3.5" />}
      </button>
    </div>
  )
}
