import type { DateKey } from '@/lib/dates'
import { today } from '@/lib/dates'
import type { MedicineGroup } from '@/lib/schedule'
import { canResume, courseStatus, isDeleted } from '@/lib/schedule'

/** A course-level action a medicine card can offer. */
export type CourseAction = 'edit' | 'stop' | 'resume' | 'restart' | 'restore' | 'delete'

/**
 * What a medicine card offers, in the order it offers it.
 *
 * One rule rather than a condition per button. The actions are not independent
 * of each other — Resume and Start again are the two answers to the same
 * question and must never both appear, Delete is offered on everything except
 * what is already deleted, and Edit and Stop only make sense while a course is
 * still going somewhere. Spread across the JSX that draws them, those
 * relationships were only true by coincidence.
 */
export function courseActions(g: MedicineGroup, ref: DateKey = today()): CourseAction[] {
  // A deleted medicine is off the board entirely: Restore is the only way back
  // to a card that has any other action at all.
  if (isDeleted(g)) return ['restore']

  const status = courseStatus(g, ref)
  if (status === 'active' || status === 'upcoming') return ['edit', 'stop', 'delete']

  // Both halves of the way out of a closed course, divided by whether there is
  // any of it left. Resume returns you to the prescription you had; Start again
  // is a new prescription that happens to be the same medicine.
  return [canResume(g, ref) ? 'resume' : 'restart', 'delete']
}
