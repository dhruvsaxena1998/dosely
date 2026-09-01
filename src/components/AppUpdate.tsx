import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'checking' | 'updating' | 'current'

/** Resolves once this worker has taken over, or given up trying. */
function settled(worker: ServiceWorker) {
  return new Promise<void>((resolve) => {
    if (worker.state === 'activated' || worker.state === 'redundant') return resolve()
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') resolve()
    })
  })
}

/**
 * An installed app runs from the copy its worker cached, so a fix shipped this
 * morning is not the one on the phone until that worker is replaced.
 *
 * Replacing it is not enough on its own. The generated registration skips
 * waiting and claims the page, but nothing in it reloads: the new bundle lands
 * in the cache while the tab keeps running the one it already parsed. So this
 * waits for the incoming worker to take over and then reloads onto it, and
 * prints the build it is running so a reload can be told from a no-op.
 */
export function AppUpdate() {
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = phase === 'checking' || phase === 'updating'

  async function press() {
    setPhase('checking')
    try {
      const registration =
        'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined

      // No worker is a dev build or a browser without one, where a plain reload
      // is both the right thing and the only thing available.
      if (!registration) return window.location.reload()

      await registration.update()

      const incoming = registration.installing ?? registration.waiting
      if (!incoming) {
        setPhase('current')
        return
      }

      setPhase('updating')
      await settled(incoming)
      window.location.reload()
    } catch {
      // A check that cannot reach the network is not worth an error state; the
      // build line below already says what you are running.
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={press} disabled={busy}>
          <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          {phase === 'checking' ? 'Checking' : phase === 'updating' ? 'Updating' : 'Check for updates'}
        </Button>
        {phase === 'current' ? (
          <p className="text-xs text-muted-foreground">You have the latest version.</p>
        ) : null}
      </div>
      <p className="type-data text-[11px] text-muted-foreground">Build {__BUILD_ID__}</p>
    </div>
  )
}
