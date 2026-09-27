import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react'
import { Appearance as LightAndDark } from '@/components/Appearance'
import { AppUpdate } from '@/components/AppUpdate'
import { Changelog } from '@/components/Changelog'
import { Feedback } from '@/components/Feedback'
import { PageHeader } from '@/components/PageHeader'
import { Reminders as RemindersControl } from '@/components/Reminders'
import { ThemePicker } from '@/components/ThemePicker'
import { Button } from '@/components/ui/button'
import { formatDay, shiftKey, today, useToday } from '@/lib/dates'
import { PALETTES } from '@/lib/palettes'
import { useReminderSettings } from '@/lib/reminder-settings'
import { REMINDER_HORIZON_DAYS } from '@/lib/reminders'
import { exportDatabase, importDatabase } from '@/lib/store'
import { useMode, usePalette } from '@/lib/theme'

/**
 * A part of the app's settings big enough to be worth leaving this screen for:
 * the name it goes by, the line the index prints under that name, and the page
 * behind it.
 *
 * A row and its page are the same entry rather than two lists that have to be
 * kept in step. Only three qualify — a page is the right shape for nine themes
 * or for six ntfy fields, and the wrong shape for one toggle, which is why
 * Feedback and Backup sit on the index itself rather than behind a door each.
 *
 * `Summary` is a component rather than a string because these answers are live:
 * the palette, the mode and the reminders are read off the stores they are set
 * in.
 */
type Page = {
  id: string
  title: string
  Summary: () => ReactNode
  Body: () => ReactNode
}

const PAGES: Page[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    Summary: function AppearanceSummary() {
      const palette = usePalette()
      const mode = useMode()
      const name = PALETTES.find((p) => p.id === palette)!.name
      return `${name} · ${mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}`
    },
    Body: function AppearanceBody() {
      return (
        <>
          <Heading>Theme</Heading>
          <ThemePicker />
          <div className="mt-8">
            <Heading>Light and dark</Heading>
            <LightAndDark />
          </div>
        </>
      )
    },
  },
  {
    id: 'reminders',
    title: 'Reminders',
    Summary: function RemindersSummary() {
      const settings = useReminderSettings()
      const now = useToday()
      if (!settings.enabled) return 'Off'
      return `On · through ${formatDay(shiftKey(now, REMINDER_HORIZON_DAYS))}`
    },
    Body: function RemindersBody() {
      return (
        <>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Dosely has no server of its own, so a free app called ntfy does the buzzing. It books
            three days ahead and tops that up each time you open Dosely, so reminders run out if
            you stay away for three days.
          </p>
          <RemindersControl />
        </>
      )
    },
  },
  {
    id: 'about',
    title: 'About',
    Summary: () => "What's new",
    Body: function AboutBody() {
      // No preamble. A dated list of changes under a heading that says About
      // does not need a paragraph explaining that it is a dated list of changes.
      return <Changelog />
    },
  },
]

/**
 * Three doors and two settings.
 *
 * It used to be every control the app has, open, on one scroll — about two and
 * a half thousand pixels of it once reminders were on, with no way to learn
 * what anything was set to short of scrolling past it. Then it was five doors,
 * which traded that for a tap on the way to a single toggle.
 *
 * What is behind a door is what is too big to sit here: nine themes, six ntfy
 * fields, and a list that grows with every release. Feedback is three
 * positions and Backup is two buttons, and a screen you must leave to press one
 * button is worse than the scroll it was meant to fix.
 */
export function Settings() {
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-8 px-4 py-6">
        <div className="surface divide-y overflow-hidden rounded-xl bg-card">
          {PAGES.map((page) => (
            <Link
              key={page.id}
              to={`/settings/${page.id}`}
              className="flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{page.title}</h2>
                <p className="type-data mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <page.Summary />
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>

        {/* No sentence. Three labelled positions are the explanation, and a
            paragraph above them only delays reading the one you want. */}
        <section>
          <Heading>Feedback</Heading>
          <Feedback />
        </section>

        <section>
          <Heading>Backup</Heading>
          <Backup />
        </section>

        <section>
          <Heading>Version</Heading>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Updates arrive on their own. This fetches one now.
          </p>
          <AppUpdate />
        </section>
      </div>
    </div>
  )
}

/**
 * One of the three, opened. Its own screen rather than a fold, because a fold
 * over six ntfy fields is a scroll with a lid on it.
 */
export function SettingsSection() {
  const { section: id } = useParams()
  const page = PAGES.find((p) => p.id === id)

  // A settings URL that names nothing, or one that names something that has
  // since come back onto the index. There is no page to draw and no error worth
  // a screen, so it lands where the setting actually lives.
  if (!page) return <Navigate to="/settings" replace />

  return (
    <div className="screen mx-auto w-full max-w-md">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <header className="app-header flex items-center gap-1 border-b bg-background px-2 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/settings">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="truncate text-base font-semibold tracking-[-0.01em]">{page.title}</h1>
        </header>
        <div className="px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
          <page.Body />
        </div>
      </div>
    </div>
  )
}

/**
 * On the settings screen rather than behind a footer on the medicines list,
 * where it was only reachable once you had added a medicine — so the one person
 * who most needed Import, someone restoring a backup into an empty install,
 * could not get to it.
 */
function Backup() {
  const [message, setMessage] = useState<string | null>(null)

  function download() {
    const blob = new Blob([exportDatabase()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dosely-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function upload(file: File) {
    file.text().then((text) => {
      const result = importDatabase(text)
      setMessage(result.ok ? 'Backup restored.' : result.error)
    })
  }

  return (
    <>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Everything lives on this device. Nothing is ever sent anywhere.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="size-3.5" />
          Export
        </Button>
        <Button size="sm" variant="outline" asChild>
          <label>
            <Upload className="size-3.5" />
            Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload(file)
                e.target.value = ''
              }}
            />
          </label>
        </Button>
      </div>
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="type-eyebrow text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
