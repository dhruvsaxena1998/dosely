# Dosely

A daily medicine checklist. It answers one question fast: did I already take this?

Everything lives in the browser's localStorage. No backend, no account, no sync. Two
people using it each install it on their own device and their data never meets.

## Running it

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # 339 tests
pnpm build
```

Deploying to Vercel needs no configuration beyond the `vercel.json` already here,
which rewrites every path to `index.html` so deep links work.

Install it to your home screen. That is not decoration: Safari clears localStorage
after seven days without a visit, and an installed web app is exempt from that cap.
There is also an Export button on the Settings screen.

## The look

The signature element is the **blister strip**. The day is a strip of pockets across
the header, one per dose in the order you take them, and each row's marker is a
single pocket rather than a checkbox. Empty pockets are recessed, used ones are flat
and filled. A glance at the strip answers how the day is going without reading a
word.

**Missed is not red.** It draws as absence: a dashed hollow pocket in the list, a
hatched gap in the adherence bar. Missed is defined here as the lack of a record, so
it looks like one, and an app you open five times a day should not turn red at you
over a course you are already living with. Red is reserved for delete.

### A month of pockets

History draws the month as a grid of the same pockets, one per day, on the History
screen across every course and on each medicine's page for that course alone. A
cell's fill is how much of the day was taken, in four fixed steps rather than a
ramp, so Monochrome and Newsprint keep them apart with no hue. Skipped and pending
doses are left out of the reckoning: a skip is a decision and a pending dose is
not a lapse, so today reads as full until something is actually missed. A day
with nothing taken and something missed is the hatch. Pressing a day with anything
behind it opens a sheet listing its doses; a blank day is not a button. The stamp
under the month name is the one number a doctor asks for.

Each card on the Medicines screen carries the same pocket read over a whole
course rather than a day, which is the one thing on that screen printed in the
theme's confident colour. The rule is not restated for it: a course that has
gone well is the same fill as a day that went well, and it always will be.

There is no chart library behind it. A month grid is a CSS grid, the cells are
the app's pockets, and every theme prints it for free.

### Handing the list to someone

The one moment this data leaves the device is somebody asking what you are on,
and the only answer used to be a JSON file on the Settings screen, which is not
something you can send your mother. Copy, on the Medicines header, puts the live
courses on the clipboard as plain text under the same headings the list draws
them under.

Plain text rather than a file, because the answer is usually pasted into a chat.
That rules out anything the receiving app might eat: no markdown, no table, and
no character a phone keyboard cannot type back. The shape carries the structure
instead, a blank line between courses and an indent under each name.

It copies the prescription rather than what you can see. A search is a lens for
finding one card, and a prescription that quietly dropped half your medicines
because something was still typed in the box is the kind of mistake this app
exists to prevent. The archive stays out for the same reason in reverse: a
course you finished in March is not an answer to what you are taking now.

### Themes

Nine themes ship, and they are presses rather than tints. Every one prints the same
strip; what changes is the stock, the ink, the type, how square the corners are cut,
how heavy the rule is drawn, and whether a sheet casts a shadow. A theme that only
swapped hues would not be a theme.

| | The material |
|---|---|
| **Foil** | Aluminium on cool card stock. The default. |
| **Bauhaus** | Primaries, black rules, and pockets cut as circles. |
| **Cyberpunk** | Neon on black glass. The strip glows when it fills. |
| **Luxury** | Gold on bone, set in wide Playfair caps. |
| **Monochrome** | No colour at all. |
| **Neo-brutalism** | Cream stock, a three-pixel rule, and a shadow that means it. |
| **Newsprint** | Black ink and one spot red, the way a paper is run. |
| **Swiss** | The grid, and exactly one colour for the thing you finished. |
| **Terminal** | A phosphor tube, with amber for the second channel. |

Where two themes could collide they are pulled apart on structure rather than hue.
Swiss and Newsprint are both black and red on a pale ground, so Swiss takes a cold
pure white, a three-pixel rule, no shadow and a visible baseline grid, while
Newsprint takes warm aged stock with a tooth, a hairline rule, a hard offset shadow
and a serif. Terminal is not green-on-black either: a tube's only hierarchy is
intensity, so body copy is a soft phosphor and full-strength green is spent only on
what is done.

Theme and mode are **independent axes**: every palette has its own real light and
dark, rather than nine palettes plus a tenth called dark. Both are set on the
Settings screen, and both are applied before first paint, so a dark bedside launch
never flashes white and a Terminal user never gets a white one.

`src/styles/themes.css` holds the palettes and `src/index.css` declares the contract
they fill in. A palette sets four kinds of thing, not one:

- **colour** — the token set, including `taken` / `skipped` / `missed` / pending
- **type** — three families, plus how the display face actually wants to be set,
  because "wide and heavy" is right for Archivo and wrong for Playfair
- **form** — `--radius`, `--pocket-radius`, and `--border-weight`
- **elevation** — `--elevation`, `--pocket-recess`, `--pocket-glow`

Texture comes in two kinds, because they are not the same thing. `--surface-texture`
is on the glass and paints over everything, which is what a scanline is.
`--ground-texture` is in the stock and paints under the content, which is what
Swiss's 24px layout grid and Newsprint's paper tooth are.

The defaults in `index.css` are wrapped in `:where()` so their specificity is zero.
`@import` hoists the palettes above that file, and on equal specificity a plain
`:root` would win every tie and no palette could change its own corners.

Two rules hold across all nine, because they are load-bearing. `missed` is always
the neutral hatch, so it survives Monochrome and every kind of colour blindness.
`taken` is the only state that gets the theme's confident colour. Monochrome exists
partly as the honest test of this: if the four states stay legible with no hue at
all, they are carried by fill, weight and pattern, and they are legible to anyone.

All eighteen theme/mode combinations meet WCAG AA — 4.5:1 for text, 3:1 for the
glyph inside a filled pocket.

### Type

Type has three roles in every theme. A display face for the app's own words, a body
face for your data, and a mono face for the batch-and-expiry stamp: dates, counts,
spans. A medicine name is never set in wide caps.

Fonts are self-hosted through Fontsource, because a PWA that needs the network to
look right is not offline. A theme fetches its own families the first time it is
used rather than up front, since carrying nine families to render the one you picked
is not free, and the service worker caches them after that. The picker preloads on
hover, so the switch has usually already landed by the time it is asked for.

### One press for a whole slot

Four things after breakfast is one act, so it is one press. The slot heading —
already sitting above the rows with the done-of-total tally — is the control:
pressing it takes everything in that slot still unanswered, and pressing a full
slot again clears it back to pending.

It never overwrites a decision you already made. A dose you deliberately skipped
is stepped over when filling and never taken away when clearing, which leaves a
slot holding a skip with no symmetric clear to offer — so it keeps offering the
fill, by then a no-op, rather than a clear that would quietly drop the skip. A
slot of one renders no control at all, because that row is already one press, and
neither does a day you are reading ahead to.

The fill is **one write and one answer back**: a single trip through localStorage
with every entry sharing the timestamp, and a single tick in the hand — or the
day-complete celebration, once, if that press finished the strip.

### Feedback

The app is one gesture repeated five times a day, so the pocket answers back: a
short tick on every press, and a fuller two-tap one at the moment the day's strip
is complete. Someone who is not sure a tap landed taps again, and the second tap
un-ticks the dose — which is the actual cost of a silent press.

The platform picture is not symmetrical and the design follows the asymmetry.
Android and Chrome have the Vibration API and are simply used. **iOS has no
Vibration API at all**; 17.4 added a real system haptic the web can reach through
a hidden switch-label trick, which is what `web-haptics` implements, but it needs
System Haptics turned on and it fails completely silently — there is no way to
find out from script. So iOS is not a platform without haptics; it is one where
haptics might work and you cannot ask. It therefore gets a short click **as well
as** the haptic, so that at least one of the two lands, and the Settings screen
has three positions — off, haptic, and sound too — for anyone who finds the
braces too loud at 3am.

The preference lives beside the theme in its own localStorage key and is
deliberately not in the exported database. Feedback is a property of a device,
not of a prescription; a backup restored onto a tablet must not bring the phone's
speaker with it.

## Reminders

Dosely has no server, so nothing of its own can run while it is closed. What it
can do is leave instructions with something that is always running.

**ntfy is the alarm clock and Dosely only ever sets it.** A message published
with a delivery time sits on ntfy's server until that time comes, and is then
delivered by the ntfy app on whatever phone is subscribed to the topic. That
second app is the surprising part and it is said first on the Settings screen:
the buzz does not come from Dosely, and a topic nobody subscribed to accepts
messages happily and delivers them nowhere. Hence the test button, which is the
only feedback channel the feature has.

The reason this is buildable at all is that ntfy lets a publisher **address** a
scheduled message. Each reminder is booked under `d<date>-<slot>`, one slot on
one day, for ever. Publishing to an address that already holds a pending message
replaces it. So the whole feature is a reconciliation rather than a send: work
out which reminders should exist over the next three days, compare with a small
local ledger of the ones we believe do, and send the difference.

Everything worth having falls out of the addressing rather than being coded for:

- **Opening the app twice books one reminder, not two.**
- **Adding two more medicines to after lunch corrects the count** on the
  reminder already booked, instead of arriving as a second notification.
- **Ticking a dose silences its reminder.** A slot with nothing pending left
  produces no reminder, so the next reconcile cancels the one on file. Untick it
  and it comes back. A skip counts as answered, the same rule the month grid
  holds: a skip is a decision.
- **Two devices on one topic do not double up**, because both derive the same
  addresses.
- **An ordinary open costs nothing.** The ledger already matches, so the diff is
  empty and no request is made.

It says as little as it can. "After lunch — 3 doses due." An ntfy topic has no
account and no password; **the topic is the password**, so it is generated at
eighty bits rather than chosen, and medicine names are off unless you turn them
on, next to the sentence explaining what that means.

### Three days, and then it stops

ntfy will not accept a delivery more than three days out. That is a server-side
limit rather than a default, so the window is three days and cannot be bought,
tuned or worked around without running something ourselves.

**So reminders lapse if you do not open Dosely for three days.** It is said in
the Settings section as a rule, and under it as a fact — the date the booked
reminders currently run through. In practice the window renews itself for anyone
who uses it, because tapping a reminder opens the app and opening the app books
the next three days. For anyone who stops, it goes quiet. That is the correct
way for this to fail, and it is the honest shape of a reminder in an app with no
server: it cannot outlive your attention by more than three days, so it does not
pretend to.

One known cost. If you tick a dose while offline, the cancellation does not
land, and the reminder arrives anyway for something you have already taken. The
ledger keeps the entry so a later sync retries the delete. A notification that is
out of date is the price of having nothing running on a server, and it is a
smaller price than the alternative.

The notification is a **door, not a control**. ntfy's action buttons can fire an
HTTP request, but there is nothing here to fire it at, so there is no Taken
button that would silently record nothing. Tapping it opens Dosely, which is
where the dose gets ticked and where the next three days get booked.

## The model

A **medicine** has a name, a set of **slots**, a repeat, a start date, and a
duration. The seven slots are fixed and ordered: before breakfast, after
breakfast, before lunch, after lunch, before dinner, after dinner, anytime.

The repeat is either **days of the week** or **every N days**, never both. Days
of the week is set like an alarm: all seven on until you turn one off, so daily
costs nothing and "every day except Tuesday" is one press. Weekly is a week with
one day on. Records saved before weekdays existed say "every 7 days" instead, and
they keep working: the change check compares the days a schedule produces, not
how it is spelled, so opening one and saving it untouched forks nothing. Weeks
start on Monday everywhere.

Each slot on each dose day produces its own tick. Twice a day means two slots, so
"after breakfast and dinner" is two independent rows rather than one dose that
floats between them.

Courses use a **half-open span**, `[start, start + duration)`. A five week weekly
course starting 1 Sep runs to 29 Sep, five doses. Read inclusively it would give
six. The add form previews the exact dose count before you save, which is the
cheapest place to catch a wrong start date.

A duration can also be a **count of doses** instead of a stretch of calendar.
Some prescriptions are written that way — a strip of ten tablets, ten
physiotherapy sessions — and the date they end on is the consequence rather than
the instruction. A counted course runs until it has scheduled the number it was
given, so ten doses twice a day is five days, and ten doses three times a day is
three days and a fourth holding one. The last day is partial on purpose: rounding
up would schedule a tablet that is not in the strip.

Missing a dose does not hand a day back. The schedule is the prescription, not an
inventory of what is left in the packet, and a course that grew itself a spare
day every time a dose went untaken could never record one as missed.

There are no dependencies between medicines. A medicine prescribed a few days
after another one is modelled as its own course with a later start date. If you
move the first, you move the second yourself.

### Versions

Editing a name or a note rewrites every version of the medicine, because fixing a
typo should fix it everywhere. Editing anything that moves a dose closes the
current version as of today and opens a new one, sharing a `groupId` so it still
reads as one medicine. Each version owns a bounded date range, so what was
prescribed on any past date stays exact and the history panel cannot lie.

The fork keeps the original anchor date, so editing a Monday medicine on a
Wednesday does not drag its doses off their Monday.

A counted course forks with what is left of the count rather than the whole strip
again, so dropping the lunchtime dose halfway through twenty tablets schedules the
remaining ten at the new rate. Typing a different number is read as a new
prescription and taken at its word.

### Ending a course early

Two presses end a course before it runs out, and the difference between them is
whether today counts. **Finish** says today was the last day: the course ends
with today, this morning's tick stays inside it, tonight's dose is still there to
take, and the card reads Done. **Stop** says the course does not include today at
all — it stops appearing immediately, reads as Stopped, and offers a Resume.

The distinction is not cosmetic. A prescription written for three weeks and ended
at a fortnight because it worked is a completed course, and offering to resume a
medicine you were told to come off is the app giving advice it has no business
giving. Either way the days that never happened are outside the window, so they
sit in no denominator and are never marked missed: fourteen of fourteen, not
fourteen of twenty-one.

### The log

`taken` and `skipped` are the only things ever written. **Missed is derived**: a
past dose day with no entry. Nothing has to run on a schedule, and a dose ticked
late simply stops being missed.

Entries are keyed by `groupId | date | slot`, not by version, so ticks survive an
edit. Each one stores the full timestamp and the medicine's name at that moment.

### Days

The day rolls over at 3am, so a pill swallowed at 1am counts for the night before.
The Today screen steps back a fortnight; anything older is locked.

A locked past is what makes the log worth trusting, so there is a floor at all.
Where it sits is a guess about how long you can go without opening the app, and
three days was the wrong guess: a long weekend away put the record beyond
correcting, which is worse than a gap in it. Fourteen covers a trip and still
refuses to let last month be written from memory.

It also steps **forward**, because "what do I take tomorrow" is a question you ask
the night before. A day ahead reads rather than presses: the rows lose their tick
and skip targets, since a dose you have not taken yet is a plan and not a record,
and the header counts *due* instead of *left*. Tapping the date opens a field that
jumps to any day directly, for the question that is about next Tuesday rather than
about tomorrow.

Forward walking stops at the **horizon**: the last date any live course still
schedules a dose. Past it every day is empty, and an arrow that only ever finds
"nothing due" would promise depth the data does not have. The horizon is the last
*dose day*, not the end of the course window — a weekly course running to 6 Oct
stops at 29 Sep, because that is the last day it actually asks anything of you.

## Layout

```
src/lib/dates.ts         date keys, the 3am rollover, half-open course ends
src/lib/slots.ts         the seven slots and their fixed order
src/lib/weekdays.ts      ISO weekdays, Monday first, and the every-day normal form
src/lib/calendar.ts      month layout and how full a day draws — pure
src/lib/schedule.ts      versions, dose days, adherence — all pure
src/lib/prescription.ts  the live courses as plain text to paste — pure
src/lib/clipboard.ts     the only place that touches the Clipboard API
src/lib/store.ts         localStorage plus the mutations, the only stateful module
src/lib/feedback.ts      whether and how a press answers back
src/screens/             Today, Medicines, MedicineForm, History, MedicineHistory
```

`schedule.ts` is pure and carries most of the tests. `store.ts` is the only place
that writes.

## Not built

Reminders that outlive your attention. The paragraph that used to sit here was
right about the mechanism and right about the limit — a cron would need your
schedule on a server, and ntfy's scheduled delivery caps at three days ahead —
and the limit has not moved. What changed is that three days turned out to be
enough to be worth having, because a reminder is also the thing that brings you
back to set the next three. See **Reminders** above for exactly when it stops
working.

Recording a dose from the notification, for the reason given there: there is no
backend to receive it.

The app is still built for people who remember to take medicines and forget
whether they did. The reminders are an opt-in second answer, off until you turn
them on, and nothing about the app changes if you never do.
