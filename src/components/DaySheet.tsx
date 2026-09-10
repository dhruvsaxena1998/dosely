import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DateKey } from '@/lib/dates'
import { formatDayLong, formatTime } from '@/lib/dates'
import { OUTCOME_CHIP, OUTCOME_LABEL } from '@/lib/outcome'
import type { Dose } from '@/lib/schedule'
import { slotLabel } from '@/lib/slots'
import { cn } from '@/lib/utils'

/**
 * One day, opened from the month grid: every dose it scheduled and what became
 * of each. Rises from the bottom, where a thumb already is.
 */
export function DaySheet({
  date,
  doses,
  onClose,
}: {
  date: DateKey | undefined
  doses: Dose[]
  onClose: () => void
}) {
  return (
    <DialogPrimitive.Root open={date !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="surface fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-xl border bg-popover p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-popover-foreground outline-none duration-150 data-open:animate-in data-open:slide-in-from-bottom-4 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-bottom-4 data-closed:fade-out-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="type-display text-sm uppercase">
                {date ? formatDayLong(date) : ''}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="type-data mt-1 text-[11px] text-muted-foreground">
                {doses.length} {doses.length === 1 ? 'dose' : 'doses'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" className="-mt-1 -mr-2">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <ul className="mt-3 space-y-1.5">
            {doses.map((dose) => (
              <li
                key={`${dose.group.groupId}-${dose.slot}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{dose.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{slotLabel(dose.slot)}</div>
                </div>
                <span
                  className={cn(
                    'type-data shrink-0 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.06em]',
                    OUTCOME_CHIP[dose.outcome],
                  )}
                >
                  {OUTCOME_LABEL[dose.outcome]}
                  {dose.entry ? ` ${formatTime(dose.entry.at)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
