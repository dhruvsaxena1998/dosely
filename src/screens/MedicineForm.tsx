import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DurationUnit } from '@/lib/dates'
import { courseEndFrom, isValidKey, today } from '@/lib/dates'
import { describeSpan } from '@/lib/describe'
import { doseHistory, groupMedicines } from '@/lib/schedule'
import { SLOTS, type SlotId } from '@/lib/slots'
import { addMedicine, updateMedicine, useDatabase } from '@/lib/store'
import { TOGGLE_ITEM } from '@/lib/ui'
import type { MedicineInput, MedicineRecord } from '@/types'
import { cn } from '@/lib/utils'

type RepeatMode = 'daily' | 'weekly' | 'custom'

function repeatModeOf(days: number): RepeatMode {
  if (days === 1) return 'daily'
  if (days === 7) return 'weekly'
  return 'custom'
}

export function MedicineForm() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const db = useDatabase()
  const now = today()

  const existing = useMemo(() => {
    if (!groupId) return undefined
    return groupMedicines(db.medicines).find((g) => g.groupId === groupId)?.current
  }, [db, groupId])

  const [name, setName] = useState(existing?.name ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [slots, setSlots] = useState<SlotId[]>(existing?.slots ?? [])
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(repeatModeOf(existing?.repeatEveryDays ?? 1))
  const [customRepeat, setCustomRepeat] = useState(String(existing?.repeatEveryDays ?? 2))
  const [startDate, setStartDate] = useState(existing?.anchorDate ?? now)
  const [durationValue, setDurationValue] = useState(String(existing?.durationValue ?? 7))
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(existing?.durationUnit ?? 'days')

  const repeatEveryDays =
    repeatMode === 'daily' ? 1 : repeatMode === 'weekly' ? 7 : Math.max(1, Number(customRepeat) || 1)
  const duration = Math.max(1, Number(durationValue) || 0)

  const valid =
    name.trim().length > 0 && slots.length > 0 && duration >= 1 && isValidKey(startDate) && Number(durationValue) >= 1

  const preview = useMemo(() => {
    if (!valid) return undefined
    const provisional: MedicineRecord = {
      id: 'preview',
      groupId: 'preview',
      name,
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
  }, [valid, name, slots, repeatEveryDays, startDate, duration, durationUnit])

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

  function save() {
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
    navigate('/medicines')
  }

  return (
    <div className="pb-8">
      <header className="app-header flex items-center gap-1 border-b bg-background px-2 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/medicines">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="type-display text-base uppercase">{groupId ? 'Edit medicine' : 'Add medicine'}</h1>
      </header>

      <div className="space-y-6 px-4 py-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="type-eyebrow text-muted-foreground">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paracetamol 500MG or Crocin"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Strength and alternate brands go in the name, exactly as the prescription reads.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="type-eyebrow text-muted-foreground">Slots</Label>
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
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            One tick per slot per dose day. Twice a day means picking two slots.
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration" className="type-eyebrow text-muted-foreground">Runs for</Label>
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

        <div className="space-y-2">
          <Label htmlFor="note" className="type-eyebrow text-muted-foreground">Note</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the prescription says that the fields above do not cover"
            rows={2}
          />
        </div>

        <div className="rounded-xl border border-dashed bg-muted/40 p-3.5">
          <p className="type-eyebrow mb-2 text-muted-foreground">Schedule</p>
          {preview ? (
            <>
              <p className="type-data text-sm font-medium uppercase tracking-[0.04em]">{preview.span}</p>
              <p className="type-data mt-1 text-[11px] text-muted-foreground">{preview.summary}</p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Fill in a name, at least one slot and a duration to see the schedule.
            </p>
          )}
        </div>

        {willFork ? (
          <p className="text-xs text-muted-foreground">
            This changes the schedule, so it takes effect from today. Everything you already ticked keeps the old
            schedule.
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!valid} onClick={save}>
            {groupId ? 'Save changes' : 'Add medicine'}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/medicines">Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
