import { BellRing, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { readSurface } from '@/lib/install'

/**
 * Hand the tap to the installed app, through Android's intent scheme.
 *
 * A plain link would navigate this browser rather than leave it, because an
 * in-page navigation never goes out to the system to ask who handles the URL.
 * `intent://` does ask, and the app Chrome installed registered itself for
 * these paths — so the OS hands it over. No package name: it is generated per
 * site and per install, and naming the scheme is enough for Android to resolve
 * it.
 */
function appIntent(): string {
  return `intent://${window.location.host}/#Intent;scheme=https;end`
}

/**
 * Where a reminder's tap actually lands, in a browser.
 *
 * Tapping a notification cannot reach the installed app on iOS — a home screen
 * web app has no way to claim an https link — so Safari opens instead, against
 * its own separate storage. That copy is a different, empty Dosely: no
 * medicines, no history, nothing ticked. Landing someone there with no
 * explanation is the worst version of this, because an empty medicine list
 * reads as lost data rather than as the wrong window.
 *
 * So the browser gets a signpost instead of an app. It says what happened,
 * says nothing is lost, and points at the icon that does have the data behind
 * it. Android can do better than a signpost, so there it is a button.
 */
export function ReminderLanding() {
  const surface = readSurface()

  return (
    <div className="screen mx-auto w-full max-w-md">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col justify-center gap-7 px-7 py-14">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="pocket pocket-empty flex size-12 items-center justify-center border border-border bg-muted">
              <BellRing className="size-5 text-muted-foreground" />
            </div>
            <h1 className="type-display mt-1 text-2xl">A dose is due</h1>
            <p className="mt-1 max-w-[20rem] text-sm leading-relaxed text-muted-foreground">
              You have landed in a browser tab rather than in Dosely. This tab cannot see your
              medicines — they live inside the app on your home screen, and nothing has been lost.
            </p>
          </div>

          {surface === 'android' ? (
            <div className="flex flex-col items-center gap-3">
              <Button asChild>
                <a href={appIntent()}>
                  <ExternalLink className="size-3.5" />
                  Open Dosely
                </a>
              </Button>
              <p className="max-w-[20rem] text-center text-xs leading-relaxed text-muted-foreground">
                If that does not open the app, tap the Dosely icon on your home screen instead.
              </p>
            </div>
          ) : (
            <p className="max-w-[20rem] self-center text-center text-sm leading-relaxed text-muted-foreground">
              Tap the <strong className="font-semibold text-foreground">Dosely</strong> icon on your
              home screen to tick the dose off.
            </p>
          )}

          <p className="max-w-[20rem] self-center text-center text-xs leading-relaxed text-muted-foreground">
            Opening the app is also what books the next three days of reminders, so it is worth
            doing rather than dismissing this.
          </p>
        </div>
      </div>
    </div>
  )
}
