import type { DateKey } from '@/lib/dates'

/** What changed on one day, newest line first. */
export type Release = {
  on: DateKey
  lines: string[]
}

/**
 * Written by hand, in the words of someone using the app rather than someone
 * building it. The build id below it says which copy of Dosely is running,
 * which is a different question from what is new in it — and only the first of
 * those can be answered from the bundle.
 *
 * Newest day first. A day is the unit because Dosely ships when a change is
 * done rather than in numbered releases, so there is no version to group by.
 */
export const CHANGELOG: Release[] = [
  {
    on: '2026-09-27',
    lines: [
      'Medicines and History are one tab. A card opens the medicine, where its record and its buttons now live together.',
      'The month of pockets folds into the top of the Medicines list, with the month\u2019s number showing while it is shut.',
      'Settings fits on one screen. Appearance, Reminders and About open a page of their own; Feedback and Backup stayed put.',
    ],
  },
  {
    on: '2026-09-02',
    lines: [
      'Take a whole slot with one press on its heading.',
      'A tick answers back in the hand, and on iPhones in the ear. Settings can turn it down.',
      'Enter a prescription of several medicines without retyping the schedule for each one.',
      'Left open past 3am, the app now moves on to the new day by itself.',
      'Editing a stopped or deleted medicine no longer quietly restarts it.',
      'A medicine in the archive can be deleted for good, its history with it.',
    ],
  },
  {
    on: '2026-09-01',
    lines: [
      'Walk the day strip forward to read tomorrow before it arrives.',
      'Check for updates from Settings, and see which build is running.',
      'Nine themes, and a light and dark switch.',
      'A dose that has been ticked is no longer counted as due.',
    ],
  },
]
