import { shiftKey, today } from '@/lib/dates'
import { addMedicine } from '@/lib/store'
import type { MedicineInput } from '@/types'

/**
 * A sample course for a first run. It is built to exercise the awkward cases:
 * one medicine sold under two names, one taken twice a day, two weekly ones,
 * and a pair where the second is deliberately offset three days from the first
 * rather than tracked as a dependency.
 */
export function examplePrescriptions(start = today()): MedicineInput[] {
  return [
    {
      name: 'Paracetamol 500MG or Crocin',
      slots: ['after-breakfast', 'after-dinner'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 7,
      durationUnit: 'days',
    },
    {
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 7,
      durationUnit: 'days',
    },
    {
      name: 'Cetirizine 10MG',
      note: 'At night',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 21,
      durationUnit: 'days',
    },
    {
      name: 'Multivitamin',
      slots: ['after-breakfast', 'after-dinner'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 30,
      durationUnit: 'days',
    },
    {
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 30,
      durationUnit: 'days',
    },
    {
      name: 'Magnesium 250MG',
      note: 'Evening or night',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: start,
      durationValue: 30,
      durationUnit: 'days',
    },
    {
      name: 'Vitamin B12',
      note: 'Weekly. Vitamin C follows three days later.',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: start,
      durationValue: 5,
      durationUnit: 'weeks',
    },
    {
      name: 'Vitamin C 500MG',
      note: 'Three days after Vitamin B12',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: shiftKey(start, 3),
      durationValue: 5,
      durationUnit: 'weeks',
    },
    {
      name: 'Vitamin D3 60000',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: start,
      durationValue: 8,
      durationUnit: 'weeks',
    },
  ]
}

export function loadExamples(start = today()) {
  for (const input of examplePrescriptions(start)) addMedicine(input)
}
