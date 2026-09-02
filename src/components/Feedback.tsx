import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setFeedbackMode, useFeedbackMode, type FeedbackMode } from '@/lib/feedback'
import { TOGGLE_ITEM } from '@/lib/ui'
import { cn } from '@/lib/utils'

/**
 * Three positions rather than two switches. Sound without haptics is not a
 * thing anyone asked for, and the middle position is the whole point on a phone
 * that can already answer in the hand.
 */
const OPTIONS: { value: FeedbackMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'haptic', label: 'Haptic' },
  { value: 'haptic-and-sound', label: 'And sound' },
]

export function Feedback() {
  const mode = useFeedbackMode()
  return (
    <ToggleGroup
      type="single"
      aria-label="Feedback"
      value={mode}
      onValueChange={(value) => value && setFeedbackMode(value as FeedbackMode)}
      variant="outline"
      className="grid w-full grid-cols-3 gap-2"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className={cn('type-eyebrow', TOGGLE_ITEM)}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
