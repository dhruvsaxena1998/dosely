import { describe, expect, it } from 'vitest'
import { prescriptionText } from '@/lib/prescription'
import { groupMedicines } from '@/lib/schedule'
import type { Database, MedicineInput, MedicineRecord } from '@/types'

const EMPTY: Database = { version: 1, medicines: [], log: {} }

let seq = 0
function group(input: MedicineInput, overrides: Partial<MedicineRecord> = {}) {
  seq += 1
  return groupMedicines([
    {
      ...input,
      id: `rec-${seq}`,
      groupId: `grp-${seq}`,
      effectiveFrom: input.anchorDate,
      createdAt: '2026-09-01T00:00:00.000Z',
      ...overrides,
    },
  ])[0]
}

const metformin = group({
  name: 'Metformin 500MG',
  note: 'With food',
  slots: ['after-dinner', 'after-breakfast'],
  repeatEveryDays: 1,
  anchorDate: '2026-09-01',
  durationValue: 3,
  durationUnit: 'months',
})

const vitaminD = group({
  name: 'Vitamin D3 60000',
  slots: ['anytime'],
  repeatEveryDays: 1,
  weekdays: [7],
  anchorDate: '2026-09-20',
  durationValue: 8,
  durationUnit: 'weeks',
})

describe('the prescription as text', () => {
  it('prints a course as a name and an indented block under it', () => {
    expect(prescriptionText(EMPTY, [{ title: 'Running', groups: [metformin] }], '2026-09-16')).toBe(
      [
        'Dosely · 16 Sep 2026',
        '',
        'RUNNING',
        '',
        'Metformin 500MG',
        '  After breakfast, After dinner',
        '  Daily for 3 months · 1 Sep to 30 Nov 2026',
        '  With food',
      ].join('\n'),
    )
  })

  it('leaves a course with no note at three lines', () => {
    const text = prescriptionText(EMPTY, [{ title: 'Not started', groups: [vitaminD] }], '2026-09-16')
    expect(text).toContain('Vitamin D3 60000\n  Anytime\n  Sundays for 8 weeks · 20 Sep to 14 Nov 2026')
  })

  it('keeps the sections in the order the list draws them', () => {
    const text = prescriptionText(
      EMPTY,
      [
        { title: 'Running', groups: [metformin] },
        { title: 'Not started', groups: [vitaminD] },
      ],
      '2026-09-16',
    )
    expect(text.indexOf('RUNNING')).toBeLessThan(text.indexOf('NOT STARTED'))
  })

  it('leaves out a section with nothing in it', () => {
    const text = prescriptionText(
      EMPTY,
      [
        { title: 'Running', groups: [metformin] },
        { title: 'Not started', groups: [] },
      ],
      '2026-09-16',
    )
    expect(text).not.toContain('NOT STARTED')
  })

  // The button that copies this is not drawn at all when there is nothing live,
  // and this is the same rule held where it cannot be skipped.
  it('says nothing at all when every section is empty', () => {
    expect(prescriptionText(EMPTY, [{ title: 'Running', groups: [] }], '2026-09-16')).toBe('')
    expect(prescriptionText(EMPTY, [], '2026-09-16')).toBe('')
  })

  // A prescription is usually pasted into a chat, and a stray asterisk or
  // underscore is bold or italic by the time it lands.
  it('carries no markdown for a chat app to eat', () => {
    const text = prescriptionText(
      EMPTY,
      [{ title: 'Running', groups: [metformin, vitaminD] }],
      '2026-09-16',
    )
    expect(text).not.toMatch(/[*_#`|]/)
  })
})
