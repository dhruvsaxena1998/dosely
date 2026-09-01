import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setMode, useMode, type Mode } from '@/lib/theme'
import { TOGGLE_ITEM } from '@/lib/ui'
import { cn } from '@/lib/utils'

const OPTIONS: { value: Mode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function Appearance() {
  const mode = useMode()
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && setMode(value as Mode)}
      variant="outline"
      className="grid w-full grid-cols-3 gap-2"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className={cn("type-eyebrow", TOGGLE_ITEM)}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
