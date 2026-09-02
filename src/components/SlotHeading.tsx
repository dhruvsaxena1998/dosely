import type { SlotAction } from '@/lib/schedule'

/**
 * Tracked caps, a hairline, and the tally. The rule earns its place by carrying
 * the count.
 *
 * Given something to do it becomes the press that does it, the whole row wide,
 * because four things after breakfast is one act and the thumb should not have
 * to hit four targets to say so. The heading survives the promotion: the button
 * sits inside it rather than around it, so a slot is still a landmark to jump
 * between when it is also a control.
 */
export function SlotHeading({
  label,
  done,
  total,
  bulk,
}: {
  label: string
  done: number
  total: number
  /** Absent where a tick is not on offer, or where the slot is already one press. */
  bulk?: { action: SlotAction; onPress: () => void }
}) {
  const row = (
    <>
      <span className="type-eyebrow text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
      <span className="type-data text-[11px] text-muted-foreground">
        {done}/{total}
      </span>
    </>
  )

  if (!bulk) {
    return <h2 className="mb-2.5 flex items-center gap-3">{row}</h2>
  }

  // The press pads itself out for the thumb, so the heading gives that back to
  // keep both shapes sitting the same distance above the rows.
  return (
    <h2 className="mb-2">
      <button
        type="button"
        onClick={bulk.onPress}
        // The row reads as a heading and a tally. What a press does is neither,
        // so it is said outright rather than left to be inferred from a chevron.
        aria-label={bulk.action === 'fill' ? `Take all of ${label}` : `Clear all of ${label}`}
        className="flex w-full items-center gap-3 rounded-lg py-0.5 text-left transition-opacity active:opacity-60"
      >
        {row}
      </button>
    </h2>
  )
}
