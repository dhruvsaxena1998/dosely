import { Check } from 'lucide-react'
import { PALETTES, type PaletteId } from '@/lib/palettes'
import { loadPaletteFonts, setPalette, usePalette, useResolvedMode } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Each option prints its own name in its own type, on its own stock, with a
 * four-pocket strip showing the four states. That is the whole product in one
 * tile, so nobody has to switch the app to find out what a theme looks like.
 */
function Sample({ palette, active, dark }: { palette: PaletteId; active: boolean; dark: boolean }) {
  const entry = PALETTES.find((p) => p.id === palette)!
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => setPalette(palette)}
      // Fetch the type on intent rather than on click, so the switch has
      // usually already landed by the time it is asked for.
      onPointerEnter={() => void loadPaletteFonts(palette)}
      onFocus={() => void loadPaletteFonts(palette)}
      className={cn(
        'group block w-full rounded-lg text-left transition-transform active:scale-[0.985]',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
      )}
    >
      {/* The tile carries its own palette and the current mode, so it renders
          in the theme it is selling, at the time of day you are in. */}
      <span
        data-palette={palette}
        className={cn(
          dark && 'dark',
          'surface block overflow-hidden rounded-lg bg-background p-3',
          active && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
        )}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="type-display truncate text-sm text-foreground">{entry.name}</span>
          {active ? (
            <Check className="size-3.5 shrink-0 text-foreground" strokeWidth={3} aria-hidden />
          ) : null}
        </span>
        <span className="mt-2 flex gap-[3px]" aria-hidden>
          <span className="pocket pocket-filled h-2.5 flex-1 border-taken bg-taken" />
          <span className="pocket pocket-filled h-2.5 flex-1 border-skipped bg-skipped" />
          <span className="pocket hatch h-2.5 flex-1 border-border" />
          <span className="pocket pocket-empty h-2.5 flex-1 border-border bg-muted" />
        </span>
      </span>
    </button>
  )
}

export function ThemePicker() {
  const current = usePalette()
  const dark = useResolvedMode() === 'dark'
  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2.5">
        {PALETTES.map((p) => (
          <Sample key={p.id} palette={p.id} active={p.id === current} dark={dark} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {PALETTES.find((p) => p.id === current)!.note} Every theme has its own light and dark, so the
        two settings are independent.
      </p>
    </div>
  )
}
