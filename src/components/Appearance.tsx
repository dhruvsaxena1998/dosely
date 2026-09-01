import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setTheme, useTheme, type Theme } from '@/lib/theme'
import { TOGGLE_ITEM } from '@/lib/ui'
import { cn } from '@/lib/utils'

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function Appearance() {
  const theme = useTheme()
  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => value && setTheme(value as Theme)}
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
