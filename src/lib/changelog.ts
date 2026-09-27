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
      'Medicines and History are one tab. Tap a medicine for its record and the buttons that end or restart it.',
      'The month of pockets folds into the top of the Medicines list, with the month\u2019s score showing while it is shut.',
      'Settings fits on one screen. Appearance, Reminders and About open a page of their own.',
      'Adding a medicine works again on an address without https, and on older iPhones.',
    ],
  },
  {
    on: '2026-09-22',
    lines: [
      'A dose you skip or miss stays in the packet. A course counted in doses runs until the count is actually taken.',
    ],
  },
  {
    on: '2026-09-20',
    lines: [
      'Reminders, three days at a time, through the ntfy app on your phone.',
      'Tapping a reminder lands somewhere that knows what to do next, and reminders can be synced by hand.',
      'Prescribe a course in doses rather than days \u2014 a strip of ten is ten doses.',
      'Finish a course early and have it read as completed rather than cut short.',
    ],
  },
  {
    on: '2026-09-16',
    lines: [
      'Copy your live prescription as plain text, to paste into a chat.',
      'Correct a dose up to a fortnight back, rather than three days.',
      'Every medicine card carries a pocket showing how the whole course has gone.',
    ],
  },
  {
    on: '2026-09-10',
    lines: [
      'Repeat on chosen days of the week \u2014 Mon, Wed and Fri rather than every third day.',
      'A month of pockets, one per day, for every course and for each on its own.',
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
