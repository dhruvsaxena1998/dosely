import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * An installed app runs from the copy its worker cached, so a fix shipped this
 * morning is not the one on the phone until that worker is replaced. Asking the
 * worker to check hands the rest to the autoUpdate registration, which reloads
 * the page itself once a newer worker activates. A press therefore either lands
 * you on the new version or tells you there was not one, and never leaves you
 * guessing how many times to relaunch.
 */
export function AppUpdate() {
  const [checking, setChecking] = useState(false)
  const [current, setCurrent] = useState(false)

  async function press() {
    setChecking(true)
    setCurrent(false)
    try {
      const registration =
        'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined

      // No worker is a dev build or a browser without one, where a plain reload
      // is both the right thing and the only thing available.
      if (!registration) return window.location.reload()

      await registration.update()
      setCurrent(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={press} disabled={checking}>
        <RefreshCw className={cn('size-3.5', checking && 'animate-spin')} />
        {checking ? 'Checking' : 'Check for updates'}
      </Button>
      {current ? <p className="text-xs text-muted-foreground">You have the latest version.</p> : null}
    </div>
  )
}
