import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleCheck, EllipsisVertical, MonitorDown, Share } from 'lucide-react'
import { MetaLine } from '@/components/MetaLine'
import { Button } from '@/components/ui/button'
import { install, readSurface, useInstallState, type Surface } from '@/lib/install'

/** The one glyph a visitor has to find on their own screen to get started. */
const GLYPH: Record<Surface, LucideIcon> = {
  ios: Share,
  android: EllipsisVertical,
  desktop: MonitorDown,
}

const STEPS: Record<Surface, string[]> = {
  ios: [
    'Tap the share button in the browser toolbar.',
    'Scroll down the sheet and choose “Add to Home Screen”.',
    'Open Dosely from your home screen.',
  ],
  android: [
    'Open the browser menu.',
    'Choose “Install app”, or “Add to Home screen”.',
    'Open Dosely from your home screen.',
  ],
  desktop: [
    'Click the install icon at the end of the address bar.',
    'Or open the browser menu and choose “Install Dosely”.',
    'Launch Dosely from its own window.',
  ],
}

/**
 * The door. Dosely is a checklist you open once a day and tick, which is a
 * home screen icon's job: a tab is a thing you have to go and find, and the
 * doses live in this browser's own storage, so the tab that holds them is not
 * somewhere to leave them. Nothing behind here works until it is installed.
 */
export function Install() {
  const { offerable } = useInstallState()
  const surface = readSurface()
  // It installed, but this tab is still a tab: accepting the prompt does not
  // move you into the app, so the steps have to give way to where to go next.
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    const done = () => setLanded(true)
    window.addEventListener('appinstalled', done)
    return () => window.removeEventListener('appinstalled', done)
  }, [])
  const Icon = landed ? CircleCheck : GLYPH[surface]

  return (
    <div className="screen mx-auto w-full max-w-md">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col justify-center gap-7 px-7 py-14">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="pocket pocket-empty flex size-12 items-center justify-center border border-border bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <h1 className="type-display mt-1 text-2xl">Dosely</h1>
            <MetaLine parts={landed ? ['Installed'] : ['Add to home screen']} />
            <p className="mt-1 max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
              {landed
                ? 'Dosely is on your home screen. Open it from there — this tab is not where it runs.'
                : 'Dosely lives on your home screen, not in a browser tab. It opens like any other app, works with no signal, and keeps everything on this device.'}
            </p>
          </div>

          {landed ? null : (
            <>
              <ol className="surface space-y-3 rounded-xl border-border bg-card px-4 py-4">
                {STEPS[surface].map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="type-data mt-px flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[11px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>

              {offerable ? (
                <div className="flex flex-col items-center gap-2">
                  <Button className="w-full" onClick={() => void install()}>
                    Install Dosely
                  </Button>
                  <p className="type-eyebrow text-[10px] text-muted-foreground">Or follow the steps above</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
