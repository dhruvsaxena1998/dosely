# Dosely

A daily medicine checklist. It answers one question fast: did I already take this?

Everything lives in the browser's localStorage. No backend, no account, no sync. Two
people using it each install it on their own device and their data never meets.

## Running it

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # 70 tests
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
