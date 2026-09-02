import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DurationUnit } from '@/lib/dates'
import { courseEndFrom, daysBetween, isValidKey, today } from '@/lib/dates'
import { describeDuration, describeSpan } from '@/lib/describe'
import { doseHistory, groupMedicines } from '@/lib/schedule'
import { SLOTS, type SlotId } from '@/lib/slots'
import { addMedicine, updateMedicine, useDatabase } from '@/lib/store'
import { TOGGLE_ITEM } from '@/lib/ui'
import type { MedicineInput, MedicineRecord } from '@/types'
import { cn } from '@/lib/utils'

type RepeatMode = 'daily' | 'weekly' | 'custom'

/**
 * The slot sets a prescription actually names. They fill rather than select,
 * because a prescription that says "twice a day, and one at night" is a fill
 * followed by an edit — so pressing one of these never takes a slot away that
 * the next press would have to put back.
 */
const SLOT_PRESETS: { label: string; slots: SlotId[] }[] = [
  { label: 'Twice a day', slots: ['after-breakfast', 'after-dinner'] },
  { label: '3 times a day', slots: ['after-breakfast', 'after-lunch', 'after-dinner'] },
  { label: 'Before meals', slots: ['before-breakfast', 'before-lunch', 'before-dinner'] },
]

/** Course lengths worth a press. A month is the one that costs three otherwise. */
const DURATIONS: { value: number; unit: DurationUnit }[] = [
  { value: 5, unit: 'days' },
  { value: 7, unit: 'days' },
  { value: 15, unit: 'days' },
  { value: 1, unit: 'months' },
]

function durationKey(value: number, unit: DurationUnit): string {
  return `${value}-${unit}`
}

function repeatModeOf(days: number): RepeatMode {
  if (days === 1) return 'daily'
  if (days === 7) return 'weekly'
  return 'custom'
}

function sentenceList(parts: string[]): string {
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function MedicineForm() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const db = useDatabase()
  const now = today()
  const nameRef = useRef<HTMLInputElement>(null)

  const existing = useMemo(() => {
    if (!groupId) return undefined
    return groupMedicines(db.medicines).find((g) => g.groupId === groupId)?.current
  }, [db, groupId])

  const [name, setName] = useState(existing?.name ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [noteOpen, setNoteOpen] = useState(Boolean(existing?.note))
  const [slots, setSlots] = useState<SlotId[]>(existing?.slots ?? [])
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(repeatModeOf(existing?.repeatEveryDays ?? 1))
  const [customRepeat, setCustomRepeat] = useState(String(existing?.repeatEveryDays ?? 2))
  const [startDate, setStartDate] = useState(existing?.anchorDate ?? now)
  const [durationValue, setDurationValue] = useState(String(existing?.durationValue ?? 7))
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(existing?.durationUnit ?? 'days')
  const [added, setAdded] = useState<string>()

  const repeatEveryDays =
    repeatMode === 'daily' ? 1 : repeatMode === 'weekly' ? 7 : Math.max(1, Number(customRepeat) || 1)
  const duration = Math.max(1, Number(durationValue) || 0)

  const missing: string[] = []
  if (name.trim().length === 0) missing.push('a name')
  if (slots.length === 0) missing.push('at least one slot')
  if (!isValidKey(startDate)) missing.push('a start date')
  if (!(Number(durationValue) >= 1)) missing.push('how long it runs')
  const valid = missing.length === 0

  // The name has nothing to do with the schedule, so the schedule shows without
  // it. Naming the medicine is the one thing the user never needs telling.
  const scheduled = slots.length > 0 && isValidKey(startDate) && Number(durationValue) >= 1

  const preview = useMemo(() => {
    if (!scheduled) return undefined
    const provisional: MedicineRecord = {
      id: 'preview',
      groupId: 'preview',
      name: 'preview',
      slots,
      repeatEveryDays,
      anchorDate: startDate,
      durationValue: duration,
      durationUnit,
      effectiveFrom: startDate,
      createdAt: new Date().toISOString(),
    }
    const doses = doseHistory(groupMedicines([provisional])[0])
    const days = new Set(doses.map((d) => d.date)).size
    return {
      summary: `${doses.length} ${doses.length === 1 ? 'dose' : 'doses'} across ${days} ${days === 1 ? 'day' : 'days'}`,
      span: describeSpan(startDate, courseEndFrom(startDate, duration, durationUnit)),
    }
  }, [scheduled, slots, repeatEveryDays, startDate, duration, durationUnit])

  /** Same name as a course that already exists. Worth saying, not worth blocking. */
  const twin = useMemo(() => {
    const key = name.trim().toLowerCase()
    if (key.length === 0) return undefined
    return groupMedicines(db.medicines).find(
      (g) => g.groupId !== groupId && !g.current.deletedAt && g.current.name.trim().toLowerCase() === key,
    )?.current.name
  }, [db, groupId, name])

  /** A start date that is not today has consequences, so it says what they are. */
  const startNote = useMemo(() => {
    if (!isValidKey(startDate)) return undefined
    const offset = daysBetween(now, startDate)
    if (offset === 0) return undefined
    if (offset < 0) {
      const ago = offset === -1 ? 'yesterday' : `${-offset} days ago`
      return `Started ${ago}. Dose days before today count as missed until you tick them.`
    }
    const ahead = offset === 1 ? 'tomorrow' : `in ${offset} days`
    return `Starts ${ahead}. Nothing to tick until then.`
  }, [now, startDate])

  const willFork = Boolean(
    existing &&
      existing.effectiveFrom < now &&
      (existing.repeatEveryDays !== repeatEveryDays ||
        existing.anchorDate !== startDate ||
        existing.durationValue !== duration ||
        existing.durationUnit !== durationUnit ||
        existing.slots.length !== slots.length ||
        existing.slots.some((s) => !slots.includes(s))),
  )

  function save(andAnother = false) {
    if (!valid) return
    const input: MedicineInput = {
      name: name.trim(),
      note: note.trim() || undefined,
      slots,
      repeatEveryDays,
      anchorDate: startDate,
      durationValue: duration,
      durationUnit,
    }
    if (groupId) updateMedicine(groupId, input)
    else addMedicine(input)

    if (!andAnother) {
      navigate('/medicines')
      return
    }
    // A prescription is a stack of medicines that share a start date and a
    // course length. Keeping the schedule and clearing the rest is the
    // difference between typing one form and typing eight.
    setAdded(input.name)
    setName('')
    setNote('')
    setNoteOpen(false)
    setSlots([])
    nameRef.current?.focus()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save()
  }

  return (
    <div className="screen mx-auto w-full max-w-md">
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <header className="app-header flex items-center gap-1 border-b bg-background px-2 py-3">
            <Button asChild variant="ghost" size="icon" aria-label="Back">
              <Link to="/medicines">
                <ChevronLeft className="size-5" />
              </Link>
            </Button>
            <h1 className="type-display text-base uppercase">{groupId ? 'Edit medicine' : 'Add medicine'}</h1>
          </header>

          <div className="px-4 py-5">
            {/* Saving without leaving the screen has to say so out loud, and the
                region has to be mounted before the message arrives to be read
                out. Empty, it hides, so it costs no space. */}
            <p
              aria-live="polite"
              className="mb-4 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground empty:hidden"
            >
              {added ? `Added ${added}. The schedule is kept, so the next one only needs a name and its slots.` : ''}
            </p>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="type-eyebrow text-muted-foreground">Name</Label>
                <Input
                  id="name"
                  ref={nameRef}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (added) setAdded(undefined)
                  }}
                  placeholder="Paracetamol 500MG or Crocin"
                  autoComplete="off"
                  autoFocus={!groupId}
                  spellCheck={false}
                />
                {twin ? (
                  <p className="text-xs text-muted-foreground">
                    You already have a course called {twin}. Saving this adds a second one.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Strength and alternate brands go in the name, exactly as the prescription reads.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="type-eyebrow text-muted-foreground">Slots</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SLOT_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 min-w-0 px-1.5 text-[11px]"
                      onClick={() => setSlots([...preset.slots])}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <ToggleGroup
                  type="multiple"
                  value={slots}
                  onValueChange={(value) => setSlots(value as SlotId[])}
                  variant="outline"
                  className="grid w-full grid-cols-2 gap-2"
                >
                  {SLOTS.map((slot) => (
                    <ToggleGroupItem
                      key={slot.id}
                      value={slot.id}
                      className={cn('justify-start px-3 text-[13px]', TOGGLE_ITEM, slot.id === 'anytime' && 'col-span-2')}
                    >
                      {slot.label}
                      {/* Anytime is the one slot whose name does not say how
                          many doses it is, and it is the one people read as
                          "whenever, as often as you like". */}
                      {slot.id === 'anytime' ? (
                        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
                          {repeatEveryDays === 1 ? 'once a day' : 'once a dose day'}
                        </span>
                      ) : null}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  One tick per slot per dose day. The row above fills the usual slots; adjust it if the prescription
                  says otherwise.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="type-eyebrow text-muted-foreground">Repeats</Label>
                <ToggleGroup
                  type="single"
                  value={repeatMode}
                  onValueChange={(value) => value && setRepeatMode(value as RepeatMode)}
                  variant="outline"
                  className="grid w-full grid-cols-3 gap-2"
                >
                  <ToggleGroupItem value="daily" className={TOGGLE_ITEM}>Daily</ToggleGroupItem>
                  <ToggleGroupItem value="weekly" className={TOGGLE_ITEM}>Weekly</ToggleGroupItem>
                  <ToggleGroupItem value="custom" className={TOGGLE_ITEM}>Every N days</ToggleGroupItem>
                </ToggleGroup>
                {repeatMode === 'custom' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={customRepeat}
                      onChange={(e) => setCustomRepeat(e.target.value)}
                      className="w-24"
                    />
                    <span className="type-data text-xs text-muted-foreground">days apart</span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="start" className="type-eyebrow text-muted-foreground">Starts on</Label>
                <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                {startNote ? <p className="text-xs text-muted-foreground">{startNote}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration" className="type-eyebrow text-muted-foreground">Runs for</Label>
                <ToggleGroup
                  type="single"
                  value={DURATIONS.some((d) => durationKey(d.value, d.unit) === durationKey(duration, durationUnit))
                    ? durationKey(duration, durationUnit)
                    : ''}
                  onValueChange={(value) => {
                    const picked = DURATIONS.find((d) => durationKey(d.value, d.unit) === value)
                    if (!picked) return
                    setDurationValue(String(picked.value))
                    setDurationUnit(picked.unit)
                  }}
                  variant="outline"
                  className="grid w-full grid-cols-4 gap-2"
                >
                  {DURATIONS.map((d) => (
                    <ToggleGroupItem
                      key={durationKey(d.value, d.unit)}
                      value={durationKey(d.value, d.unit)}
                      className={cn('px-1 text-[11px]', TOGGLE_ITEM)}
                    >
                      {describeDuration(d.value, d.unit)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="flex gap-2">
                  <Input
                    id="duration"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={durationValue}
                    onChange={(e) => setDurationValue(e.target.value)}
                    className="w-24"
                  />
                  <Select value={durationUnit} onValueChange={(value) => setDurationUnit(value as DurationUnit)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">days</SelectItem>
                      <SelectItem value="weeks">weeks</SelectItem>
                      <SelectItem value="months">months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {noteOpen ? (
                <div className="space-y-2">
                  <Label htmlFor="note" className="type-eyebrow text-muted-foreground">Note</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything the prescription says that the fields above do not cover"
                    rows={2}
                    autoFocus
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2.5 h-8 text-muted-foreground"
                  onClick={() => setNoteOpen(true)}
                >
                  <Plus className="size-3.5" />
                  Add a note
                </Button>
              )}

              <div className="rounded-xl border border-dashed bg-muted/40 p-3.5">
                <p className="type-eyebrow mb-2 text-muted-foreground">Schedule</p>
                {preview ? (
                  <>
                    <p className="type-data text-sm font-medium uppercase tracking-[0.04em]">{preview.span}</p>
                    <p className="type-data mt-1 text-[11px] text-muted-foreground">{preview.summary}</p>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Pick at least one slot and how long the course runs to see the schedule.
                  </p>
                )}
              </div>

              {willFork ? (
                <p className="text-xs text-muted-foreground">
                  This changes the schedule, so it takes effect from today. Everything you already ticked keeps the old
                  schedule.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* The actions sit outside the scrollport, so a long form never hides
            its own save button. */}
        <div className="border-t bg-background px-4 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]">
          {valid ? null : (
            <p className="mb-2.5 text-xs text-muted-foreground">Needs {sentenceList(missing)}.</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1" disabled={!valid}>
              {groupId ? 'Save changes' : 'Add medicine'}
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/medicines">Cancel</Link>
            </Button>
          </div>
          {groupId ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-8 w-full"
              disabled={!valid}
              onClick={() => save(true)}
            >
              Save and add another
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
