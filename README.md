# Dosely

A daily medicine checklist. It answers one question fast: did I already take this?

Everything lives in the browser's localStorage. No backend, no account, no sync. Two
people using it each install it on their own device and their data never meets.

## Running it

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # 47 tests
pnpm build
```

Deploying to Vercel needs no configuration beyond the `vercel.json` already here,
which rewrites every path to `index.html` so deep links work.

Install it to your home screen. That is not decoration: Safari clears localStorage
after seven days without a visit, and an installed web app is exempt from that cap.
There is also an Export button on the Medicines screen.

## The look

The direction is **Foil**: the vernacular of a blister strip. That is where the app's
one signature element comes from. The day is a strip of pockets across the header,
one per dose in the order you take them, and each row's marker is a single pocket
rather than a checkbox. Empty pockets are recessed, used ones are flat and filled.
A glance at the strip answers how the day is going without reading a word.

Type has three roles. Archivo carries the width axis, so headings are genuinely
wide instead of letter-spaced apart. Public Sans was drawn for public information
notices, which is the right voice for a name you have to read exactly. IBM Plex
Mono is the batch-and-expiry stamp: dates, counts, spans. All three are self-hosted
through Fontsource, because a PWA that needs the network to look right is not
offline.

Display type is for the app's own words. Body type is for your data, so a medicine
name is never set in wide caps.

Light mode is cool paper and foil. Dark mode is a deep petrol rather than black, so
the accent belongs to the surface instead of sitting on top of it. Taken is petrol,
skipped is brass.

**Missed is not red.** It draws as absence: a dashed hollow pocket in the list, a
hatched gap in the adherence bar. Missed is defined here as the lack of a record,
so it looks like one, and an app you open five times a day should not turn red at
you over a course you are already living with. Red is reserved for delete.

Theme follows the system by default and can be pinned to light or dark from the
Medicines screen. The choice is applied before first paint, so a dark bedside
launch never flashes white.

## The model

A **medicine** has a name, a set of **slots**, a repeat of every N days, a start
date, and a duration. The seven slots are fixed and ordered: before breakfast,
after breakfast, before lunch, after lunch, before dinner, after dinner, anytime.

Each slot on each dose day produces its own tick. Twice a day means two slots, so
"after breakfast and dinner" is two independent rows rather than one dose that
floats between them.

Courses use a **half-open span**, `[start, start + duration)`. A five week weekly
course starting 1 Sep runs to 29 Sep, five doses. Read inclusively it would give
six. The add form previews the exact dose count before you save, which is the
cheapest place to catch a wrong start date.

There are no dependencies between medicines. A medicine prescribed a few days
after another one is modelled as its own course with a later start date. If you
move the first, you move the second yourself.

### Versions

Editing a name or a note rewrites every version of the medicine, because fixing a
typo should fix it everywhere. Editing anything that moves a dose closes the
current version as of today and opens a new one, sharing a `groupId` so it still
reads as one medicine. Each version owns a bounded date range, so what was
prescribed on any past date stays exact and the history panel cannot lie.

The fork keeps the original anchor date, so editing a weekly medicine on a
Wednesday does not drag its doses off their Monday.

### The log

`taken` and `skipped` are the only things ever written. **Missed is derived**: a
past dose day with no entry. Nothing has to run on a schedule, and a dose ticked
late simply stops being missed.

Entries are keyed by `groupId | date | slot`, not by version, so ticks survive an
edit. Each one stores the full timestamp and the medicine's name at that moment.

### Days

The day rolls over at 3am, so a pill swallowed at 1am counts for the night before.
The Today screen steps back three days; anything older is locked.

## Layout

```
src/lib/dates.ts       date keys, the 3am rollover, half-open course ends
src/lib/slots.ts       the seven slots and their fixed order
src/lib/schedule.ts    versions, dose days, adherence — all pure
src/lib/store.ts       localStorage plus the mutations, the only stateful module
src/screens/           Today, Medicines, MedicineForm, History, MedicineHistory
```

`schedule.ts` is pure and carries most of the tests. `store.ts` is the only place
that writes.

## Not built

Reminders. Nothing fires when the app is closed, by design: a cron would need your
schedule on a server, and ntfy's scheduled delivery caps at three days ahead, so it
stops working exactly when you stop opening the app. The app is built for people
who remember to take medicines and forget whether they did.
