import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Appearance } from '@/components/Appearance'
import { AppUpdate } from '@/components/AppUpdate'
import { Changelog } from '@/components/Changelog'
import { Feedback } from '@/components/Feedback'
import { PageHeader } from '@/components/PageHeader'
import { ThemePicker } from '@/components/ThemePicker'
import { Button } from '@/components/ui/button'
import { today } from '@/lib/dates'
import { exportDatabase, importDatabase } from '@/lib/store'

/**
 * Its own screen rather than a footer on the medicines list, where it was only
 * reachable once you had added a medicine — so the one person who most needed
 * Import, someone restoring a backup into an empty install, could not get to it.
 */
export function Settings() {
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
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-8 px-4 py-6">
        <section>
          <Heading>Theme</Heading>
          <ThemePicker />
        </section>

        <section>
          <Heading>Light and dark</Heading>
          <Appearance />
        </section>

        <section>
          <Heading>Feedback</Heading>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            A tick answers back in the hand. iPhones cannot be asked whether that landed, so they
            get a short click as well — turn it down to Haptic if the room is asleep.
          </p>
          <Feedback />
        </section>

        <section>
          <Heading>Backup</Heading>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Everything lives in this browser only. Install the app to your home screen so the browser
            does not clear it, and keep a copy somewhere safe.
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
        </section>

        <section>
          <Heading>Version</Heading>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            The app runs from a copy saved on this device, which it swaps for a newer one in the
            background. Press this to fetch and switch straight away.
          </p>
          <AppUpdate />
          <Changelog />
        </section>
      </div>
    </div>
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
