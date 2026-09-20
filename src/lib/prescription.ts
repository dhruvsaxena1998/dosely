import type { DateKey } from '@/lib/dates'
import { formatWithYear, today } from '@/lib/dates'
import { describeGroupSpan, describeLength, describeRepeat } from '@/lib/describe'
import type { MedicineGroup } from '@/lib/schedule'
import { slotLabel, sortSlots } from '@/lib/slots'

/**
 * A run of courses under the heading the list already gives them. The screen
 * passes the same sections it draws, so the text and the list can never
 * disagree about what "Running" means or which courses are in it.
 */
export interface PrescriptionSection {
  title: string
  groups: readonly MedicineGroup[]
}

/** Every line under a name is indented, which is what makes a course one block. */
const INDENT = '  '

/**
 * The prescription as plain text, for the one moment this data leaves the
 * device: a message to whoever is asking what you are on.
 *
 * Plain text rather than a file, because the answer is usually pasted into a
 * chat. That rules out anything the receiving app might eat, so there is no
 * markdown, no table and no character a phone keyboard cannot type back. The
 * shape carries the structure instead: a blank line between courses, and an
 * indent under each name.
 *
 * Reads the current version of each course, which is what the card shows. What
 * was prescribed last April is a question for the history screen.
 *
 * Empty when there is nothing live to say. A section with no courses in it is
 * left out entirely rather than printed with nothing under it.
 */
export function prescriptionText(
  sections: readonly PrescriptionSection[],
  on: DateKey = today(),
): string {
  const filled = sections.filter((s) => s.groups.length > 0)
  if (filled.length === 0) return ''

  const blocks = [`Dosely · ${formatWithYear(on)}`]
  for (const section of filled) {
    blocks.push(section.title.toUpperCase())
    for (const group of section.groups) blocks.push(courseText(group))
  }
  return blocks.join('\n\n')
}

/**
 * One course, in the order it is asked about. The slots come first because
 * "when do I take it" is the question; how often and for how long is the
 * follow-up, and the note is whatever the box said.
 */
function courseText(group: MedicineGroup): string {
  const m = group.current
  const lines = [
    sortSlots(m.slots).map(slotLabel).join(', '),
    `${describeRepeat(m)} for ${describeLength(group)} · ${describeGroupSpan(group)}`,
  ]
  if (m.note) lines.push(m.note)
  return [m.name, ...lines.map((line) => INDENT + line)].join('\n')
}
