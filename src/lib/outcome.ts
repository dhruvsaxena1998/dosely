import type { DayFill } from '@/lib/calendar'
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

/**
 * A pocket standing for a stretch of time rather than for one dose: a day in
 * the month grid, a whole course on a medicine card.
 *
 * Only taken gets the theme's confident colour, in three strengths. Missed is
 * the hatch, skipped keeps its own colour, and the rest are recessed. The steps
 * are fixed rather than a ramp so Monochrome and Newsprint keep them apart with
 * no hue at all.
 */
export const FILL_POCKET: Record<DayFill, string> = {
  none: 'border-transparent bg-transparent',
  pending: 'border-border/70 bg-muted pocket-empty',
  missed: 'border-border/70 hatch',
  skipped: 'pocket-filled [--glow-tint:var(--skipped)] border-skipped bg-skipped text-skipped-contrast',
  low: 'border-taken/40 bg-taken/25',
  high: 'border-taken/70 bg-taken/55',
  full: 'pocket-filled border-taken bg-taken text-taken-contrast',
}
