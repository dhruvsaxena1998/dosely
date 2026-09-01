import type { Dose } from '@/lib/schedule'
import { OUTCOME_CELL } from '@/lib/outcome'
import { cn } from '@/lib/utils'

/**
 * The day as a strip of foil pockets, one per dose, in the order you take them.
 * A glance answers how the day is going without reading a single word.
 */
export function DayStrip({ doses }: { doses: Dose[] }) {
  if (doses.length === 0) return null
  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {doses.map((dose) => (
        <span
          key={`${dose.group.groupId}-${dose.slot}`}
          className={cn('pocket h-3.5 flex-1', OUTCOME_CELL[dose.outcome])}
        />
      ))}
    </div>
  )
}
