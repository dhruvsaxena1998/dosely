import type { DoseOutcome } from '@/lib/schedule'

export const OUTCOME_LABEL: Record<DoseOutcome, string> = {
  taken: 'Taken',
  skipped: 'Skipped',
  missed: 'Missed',
  pending: 'Due',
}

/** The row a dose sits in on the Today screen. */
export const OUTCOME_ROW: Record<DoseOutcome, string> = {
  taken: 'border-rule-taken bg-taken/[0.07]',
  skipped: 'border-rule-skipped bg-skipped/[0.08]',
  missed: 'border-dashed border-rule-quiet bg-transparent',
  pending: 'border-rule-quiet bg-card',
}

/** The pocket you press. Empty ones are recessed, used ones are flat and filled. */
export const OUTCOME_POCKET: Record<DoseOutcome, string> = {
  taken: 'pocket-filled border-taken bg-taken text-taken-contrast',
  skipped: 'pocket-filled [--glow-tint:var(--skipped)] border-skipped bg-skipped text-skipped-contrast',
  missed: 'border-dashed border-missed bg-transparent text-transparent',
  pending: 'border-border bg-muted pocket-empty text-transparent',
}

/** One cell of the day's strip. */
export const OUTCOME_CELL: Record<DoseOutcome, string> = {
  taken: 'pocket-filled border-taken bg-taken',
  skipped: 'pocket-filled [--glow-tint:var(--skipped)] border-skipped bg-skipped',
  missed: 'border-border/70 hatch',
  pending: 'border-border/70 bg-muted pocket-empty',
}

/** A label in the history timeline. */
export const OUTCOME_CHIP: Record<DoseOutcome, string> = {
  taken: 'bg-taken/12 text-taken-foreground',
  skipped: 'bg-skipped/15 text-skipped-foreground',
  missed: 'border border-dashed border-border text-missed-foreground',
  pending: 'bg-muted text-muted-foreground',
}
