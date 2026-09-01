export const SLOTS = [
  { id: 'before-breakfast', label: 'Before breakfast' },
  { id: 'after-breakfast', label: 'After breakfast' },
  { id: 'before-lunch', label: 'Before lunch' },
  { id: 'after-lunch', label: 'After lunch' },
  { id: 'before-dinner', label: 'Before dinner' },
  { id: 'after-dinner', label: 'After dinner' },
  { id: 'anytime', label: 'Anytime' },
] as const

export type SlotId = (typeof SLOTS)[number]['id']

const ORDER = new Map<string, number>(SLOTS.map((s, i) => [s.id, i]))
const LABELS = new Map<string, string>(SLOTS.map((s) => [s.id, s.label]))

export function slotLabel(id: SlotId): string {
  return LABELS.get(id) ?? id
}

export function slotIndex(id: SlotId): number {
  return ORDER.get(id) ?? Number.MAX_SAFE_INTEGER
}

/** Slots always render in the fixed order above, never in the order they were picked. */
export function sortSlots(ids: readonly SlotId[]): SlotId[] {
  return [...ids].sort((a, b) => slotIndex(a) - slotIndex(b))
}
