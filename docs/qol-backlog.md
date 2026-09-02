# QOL backlog

Quality-of-life work, found by reading the codebase on 2 Sep 2026 at `0cfac6e`.
Ordered by how much friction each one removes per line of code it costs, not by
how interesting it is.

Nothing here is a plan. Items become specs one tier at a time.

Tier 1 is specced and sliced into tickets. Both live on GitHub, which is this
repo's tracker — see `docs/agents/issue-tracker.md`. They are deliberately not
mirrored here; one copy cannot drift from itself.

| Items | Spec | Tickets |
|---|---|---|
| 2 | [#10](https://github.com/dhruvsaxena1998/dosely/issues/10) the day rolls over while the app is open | one slice |
| 4 | [#11](https://github.com/dhruvsaxena1998/dosely/issues/11) answer the tick in the hand, and on iOS in the ear | one slice |
| 1, 5 | [#12](https://github.com/dhruvsaxena1998/dosely/issues/12) make Stop reversible, and make Start again ask first | [#14](https://github.com/dhruvsaxena1998/dosely/issues/14), [#15](https://github.com/dhruvsaxena1998/dosely/issues/15) |
| 3, 6 | [#13](https://github.com/dhruvsaxena1998/dosely/issues/13) fill a slot in one press, and find a medicine by name | [#16](https://github.com/dhruvsaxena1998/dosely/issues/16), [#17](https://github.com/dhruvsaxena1998/dosely/issues/17) |

Tiers 2 to 4 are not specced. This file is the only record of them.

## Tier 1 — daily friction, cheap to fix

**1. No un-stop.** `stopMedicine` sets `closedOn = today` and nothing ever clears
it. The only way back is "Start again", which mints a new `groupId` and seals the
old history away in a separate course. A mis-tap on Stop is permanent. Delete has
Restore; Stop has nothing.

**2. The day never rolls over in a live window.** `Today` reads `today()` once
per render, and there is no ticker and no `visibilitychange` listener anywhere in
`src/`. A bedside PWA left open across the 3am rollover keeps showing yesterday
until something unrelated forces a re-render. `Medicines` and `History` compute
`now` the same way.

**3. No bulk tick per slot.** Five pills after breakfast is five separate taps.
`SlotHeading` already knows `done` and `total`, so it is the obvious place to
press once and fill the slot.

**4. No haptic on tick.** The whole app is one gesture repeated five times a day
and that gesture is silent. Highest felt-quality-per-line item in the list.

**5. `restartMedicine` fires with no confirmation and no options.** One tap
silently creates a new course starting today, reusing the old duration, with no
chance to change either. Every other course-level action is behind an
`AlertDialog`. This one is not, and it is the one that cannot be undone.

**6. No search or collapse on the Medicines list.** Archive grows without bound
and pushes Running off the top of the screen.

## Tier 2 — model gaps that force workarounds

**7. No indefinite course.** Duration is required and at least 1. Thyroid, blood
pressure, statins — anything chronic — has to be entered as "120 months", which
then corrupts `scheduleHorizon`, the adherence denominator, and every "Done"
badge. The largest single gap in the model.

**8. No specific weekdays.** `repeatEveryDays` cannot express Mon/Wed/Fri, which
is a common prescription shape and is currently unrepresentable at all.

**9. No dose quantity.** Nothing holds "1 tablet", "5 ml", "half". The form's own
hint tells you to put strength in the name, so `name` is doing three jobs.

**10. No as-needed medicine.** A painkiller taken when needed has no schedule, so
it produces no rows, so there is no way to record having taken one.

**11. Slots are fixed, and carry no times.** Seven hardcoded labels, no clock
times, no renaming. A night shift gets a list ordered around someone else's
breakfast.

**12. Backfill is hardcoded to three days.** `BACKFILL_DAYS` has no setting and
no override. Back from a four-day trip, the record is wrong and cannot be
corrected — not from Today, not from the medicine's own history screen.

## Tier 3 — data safety

**13. Import silently destroys everything.** `Settings.upload` hands the file
straight to `importDatabase`, which commits over the whole database. No
confirmation, no backup taken first, no preview of what is in the file, no merge.
One wrong file and the data the app exists to hold is gone.

**14. `navigator.storage.persist()` is never called.** The README worries at
length about Safari clearing localStorage after seven days and answers it by
asking the user to install to the home screen. The browser API that actually
exempts the data is one line and is not in the codebase.

**15. The install gate has no escape hatch.** `gateEnforced()` returns true
unconditionally in production. Desktop Firefox cannot install PWAs, so those
visitors meet a permanent door with instructions they cannot follow.

**16. Write failures are swallowed.** `commit` catches the localStorage error and
logs it. The tick animates, the UI updates, and nothing was saved.

**17. No "clear all data".** Starting fresh or handing on a device means opening
devtools.

## Tier 4 — reach and polish

**18. App badge for outstanding doses.** `navigator.setAppBadge(left)` puts the
count on the home screen icon. It only updates while the app runs, which sits
honestly inside the "nothing fires when closed" stance in the README, and it is
the closest thing to a reminder that needs no server.

**19. Swipe to change day.** The arrows exist. The gesture is what a thumb
reaches for first.

**20. No calendar view.** A month grid of pockets would answer "how is this
course going" at a glance, in the visual language the app already owns.

**21. Export is JSON only.** No printable or shareable summary for the one moment
this data leaves the device, which is a doctor's appointment.

**22. No adherence across all medicines.** `adherenceFor` is per group. Nothing
answers "this week you took 34 of 40".

**23. Import result is not announced.** No `aria-live` on the Settings message,
and no focus management on route change.

**24. Notes truncate to one line** and are replaced by the timestamp once the
dose is ticked, with no way to read the full text.

**25. `URL.revokeObjectURL` fires immediately after `a.click()`** in
`Settings.download`, which is a known flake on some Safari builds.

**26. No cross-tab sync.** No `storage` event listener, so two open contexts
diverge and the last write wins.
