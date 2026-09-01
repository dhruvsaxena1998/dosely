/**
 * The theme registry. A theme is two independent choices: which press printed
 * the strip (the palette) and whether the lights are on (the mode). Keeping
 * them separate means every palette gets a real dark mode rather than nine
 * palettes plus a tenth called "dark".
 */

export type PaletteId =
  | 'foil'
  | 'bauhaus'
  | 'cyberpunk'
  | 'luxury'
  | 'mono'
  | 'brutal'
  | 'newsprint'
  | 'swiss'
  | 'terminal'

export interface Palette {
  id: PaletteId
  /** What the user picks it by. */
  name: string
  /** The material, in the app's own voice. One line, no salesmanship. */
  note: string
  /** Loads the typefaces this palette needs. Resolves once they are parsed. */
  loadFonts: () => Promise<unknown>
}

/**
 * Fonts are fetched only when a palette is first used, then cached by the
 * service worker like any other asset. A PWA should not carry nine families of
 * type to render the one you chose, and an offline app should still have the
 * one you did choose.
 */
export const PALETTES: Palette[] = [
  {
    id: 'foil',
    name: 'Foil',
    note: 'Aluminium on cool card stock. The original.',
    // Loaded up front in index.css, so there is nothing left to fetch.
    loadFonts: () => Promise.resolve(),
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    note: 'Primaries, black rules, and pockets cut as circles.',
    loadFonts: () => import('@fontsource-variable/outfit'),
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    note: 'Neon on black glass. The strip glows when it fills.',
    loadFonts: () =>
      Promise.all([
        import('@fontsource-variable/orbitron'),
        import('@fontsource-variable/jetbrains-mono'),
      ]),
  },
  {
    id: 'luxury',
    name: 'Luxury',
    note: 'Gold on bone, set in wide Playfair caps.',
    loadFonts: () =>
      Promise.all([
        import('@fontsource-variable/playfair-display'),
        import('@fontsource-variable/inter'),
      ]),
  },
  {
    id: 'mono',
    name: 'Monochrome',
    note: 'No colour at all. The states are fill, weight and pattern.',
    loadFonts: () =>
      Promise.all([
        import('@fontsource-variable/playfair-display'),
        import('@fontsource-variable/source-serif-4'),
        import('@fontsource-variable/jetbrains-mono'),
      ]),
  },
  {
    id: 'brutal',
    name: 'Neo-brutalism',
    note: 'Cream stock, a three-pixel rule, and a shadow that means it.',
    loadFonts: () => import('@fontsource-variable/space-grotesk'),
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    note: 'Black ink and one spot red, the way a paper is run.',
    loadFonts: () =>
      Promise.all([
        import('@fontsource-variable/playfair-display'),
        import('@fontsource-variable/lora'),
        import('@fontsource-variable/jetbrains-mono'),
      ]),
  },
  {
    id: 'swiss',
    name: 'Swiss',
    note: 'The grid, and exactly one colour for the thing you finished.',
    loadFonts: () => import('@fontsource-variable/inter'),
  },
  {
    id: 'terminal',
    name: 'Terminal',
    note: 'A phosphor tube. Scanlines, and amber for the second channel.',
    loadFonts: () => import('@fontsource-variable/jetbrains-mono'),
  },
]

const BY_ID = new Map(PALETTES.map((p) => [p.id, p]))

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && BY_ID.has(value as PaletteId)
}

export function paletteById(id: PaletteId): Palette {
  return BY_ID.get(id)!
}
