import { useMemo, useState } from 'react'
import { Check, Copy, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { copyText } from '@/lib/clipboard'
import { formatDay, shiftKey, useToday } from '@/lib/dates'
import { sendTest } from '@/lib/ntfy'
import {
  newTopic,
  setReminderSettings,
  setSlotTime,
  useReminderSettings,
} from '@/lib/reminder-settings'
import { REMINDER_HORIZON_DAYS, slotsInUse } from '@/lib/reminders'
import { syncReminders } from '@/lib/reminder-sync'
import { slotLabel } from '@/lib/slots'
import { useDatabase } from '@/lib/store'
import { TOGGLE_ITEM } from '@/lib/ui'
import { cn } from '@/lib/utils'

type Test = 'idle' | 'sending' | 'sent' | 'failed'

/** `ntfy://host/topic`, which is the only link format the Android app opens. */
function subscribeLink(server: string, topic: string): string {
  try {
    return `ntfy://${new URL(server).host}/${topic}`
  } catch {
    return `ntfy://ntfy.sh/${topic}`
  }
}

export function Reminders() {
  const settings = useReminderSettings()
  const db = useDatabase()
  const now = useToday()
  const slots = useMemo(() => slotsInUse(db, now), [db, now])
  const [test, setTest] = useState<Test>('idle')
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState<string | null>(null)

  function toggle(on: boolean) {
    // The topic is minted once and then kept. Turning reminders off and on
    // again must not mean re-subscribing on the phone, so nothing regenerates
    // it except the user asking for a new one.
    if (on) setReminderSettings({ enabled: true, topic: settings.topic || newTopic() })
    else setReminderSettings({ enabled: false })
  }

  async function copy() {
    setCopied(await copyText(settings.topic))
    setTimeout(() => setCopied(false), 2000)
  }

  async function press() {
    setTest('sending')
    const result = await sendTest({ server: settings.server, topic: settings.topic })
    setTest(result === 'ok' ? 'sent' : 'failed')
  }

  /**
   * The same run that happens on its own whenever the app is open, on a press.
   *
   * Worth a button because the automatic one is invisible by design: it sends
   * nothing when nothing has changed, so there is otherwise no way to tell a
   * healthy sync from one that has been failing quietly for days.
   */
  async function sync() {
    setSyncing(true)
    setSynced(null)
    const result = await syncReminders()
    setSyncing(false)
    if (!result.ok) {
      setSynced('Could not reach the server. It will try again next time you open the app.')
      return
    }
    if (result.booked === 0) {
      setSynced('Nothing due in the next three days.')
      return
    }
    const changed = result.published > 0 || result.cancelled > 0
    const many = result.booked === 1 ? '1 reminder' : `${result.booked} reminders`
    setSynced(changed ? `Updated. ${many} set.` : `Already up to date. ${many} set.`)
  }

  return (
    <div className="space-y-5">
      <ToggleGroup
        type="single"
        aria-label="Reminders"
        value={settings.enabled ? 'on' : 'off'}
        onValueChange={(value) => value && toggle(value === 'on')}
        variant="outline"
        className="grid w-full grid-cols-2 gap-2"
      >
        <ToggleGroupItem value="off" className={cn('type-eyebrow', TOGGLE_ITEM)}>
          Off
        </ToggleGroupItem>
        <ToggleGroupItem value="on" className={cn('type-eyebrow', TOGGLE_ITEM)}>
          On
        </ToggleGroupItem>
      </ToggleGroup>

      {settings.enabled ? (
        <>
          <Field label="Your topic">
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
              Install <strong className="font-semibold text-foreground">ntfy</strong> on your phone
              and subscribe it to this topic. That app is what buzzes; Dosely only ever sends. Anyone
              who knows the topic can read your reminders, so treat it as a password.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={settings.topic} className="font-mono text-xs" aria-label="Topic" />
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              On Android,{' '}
              <a className="underline" href={subscribeLink(settings.server, settings.topic)}>
                open it in ntfy
              </a>
              . On iPhone, open ntfy, press + and paste the topic in.
            </p>
          </Field>

          <Field label="Check it works">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={press} disabled={test === 'sending'}>
                <Send className="size-3.5" />
                {test === 'sending' ? 'Sending' : 'Send a test'}
              </Button>
              {test === 'sent' ? (
                <span className="text-xs text-muted-foreground">Sent. It should arrive now.</span>
              ) : null}
              {test === 'failed' ? (
                <span className="text-xs text-muted-foreground">Could not reach the server.</span>
              ) : null}
            </div>
          </Field>

          <Field label="When your slots fall">
            {slots.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nothing is running, so there is nothing to remind you about yet. Add a medicine and
                its slots will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {slots.map((slot) => (
                  <div key={slot} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{slotLabel(slot)}</span>
                    <Input
                      type="time"
                      aria-label={slotLabel(slot)}
                      value={settings.times[slot]}
                      onChange={(e) => e.target.value && setSlotTime(slot, e.target.value)}
                      className="w-32 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </Field>

          <Field label="What it says">
            <ToggleGroup
              type="single"
              aria-label="What it says"
              value={settings.includeNames ? 'names' : 'count'}
              onValueChange={(value) => value && setReminderSettings({ includeNames: value === 'names' })}
              variant="outline"
              className="grid w-full grid-cols-2 gap-2"
            >
              <ToggleGroupItem value="count" className={cn('type-eyebrow', TOGGLE_ITEM)}>
                Count only
              </ToggleGroupItem>
              <ToggleGroupItem value="names" className={cn('type-eyebrow', TOGGLE_ITEM)}>
                Name them
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {settings.includeNames
                ? 'Your medicines are named in the notification, and travel over a topic whose only lock is being hard to guess.'
                : 'The notification counts the doses without naming anything.'}
            </p>
          </Field>

          <Field label="Server">
            <Input
              value={settings.server}
              aria-label="Server"
              onChange={(e) => setReminderSettings({ server: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Change this only if you run your own ntfy.
            </p>
          </Field>

          <Field label="Booked reminders">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
                <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
                {syncing ? 'Syncing' : 'Sync now'}
              </Button>
            </div>
            {synced ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{synced}</p>
            ) : null}
            <ReminderHorizon through={shiftKey(now, REMINDER_HORIZON_DAYS)} />
          </Field>
        </>
      ) : null}
    </div>
  )
}

/**
 * The date the booked reminders run out: the three day rule as a fact rather
 * than as a sentence. The section above states the rule; this states today's
 * instance of it, because a limit nobody can see is a limit nobody acts on.
 */
function ReminderHorizon({ through }: { through: string }) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
      Reminders are set through <strong className="font-semibold text-foreground">{formatDay(through)}</strong>.
      Open Dosely before then to keep them going.
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="type-eyebrow mb-2 text-[10px] text-muted-foreground">{label}</h3>
      {children}
    </div>
  )
}
