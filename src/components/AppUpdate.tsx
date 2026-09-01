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

/** What the server is serving right now, or undefined if it could not be asked. */
async function deployedBuild() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (!response.ok) return undefined
    const body: unknown = await response.json()
    const id = (body as { buildId?: unknown })?.buildId
    return typeof id === 'string' ? id : undefined
  } catch {
    return undefined
  }
}

/**
 * An installed app runs from the copy its worker cached, so a fix shipped this
 * morning is not the one on the phone until that worker is replaced.
 *
 * The worker replaces itself readily enough — it skips waiting, claims the page
 * and is checked on every launch — which is exactly why asking it whether an
 * update is arriving gives the wrong answer. By the time anyone presses this,
 * the new bundle is usually already cached and active, while the tab goes on
 * running the one it parsed at launch. A worker with nothing to install is
 * indistinguishable from a worker that quietly installed everything already.
 *
 * So the question put here is not "is a new worker coming" but "is this page
 * running what is deployed", which the server can answer outright. A mismatch
 * is settled the only way it can be: take the newest worker, then reload onto
 * it, and let the build line below say which one that turned out to be.
 */
export function AppUpdate() {
  const [phase, setPhase] = useState<Phase>('idle')
  const busy = phase === 'checking' || phase === 'updating'

  async function press() {
    setPhase('checking')

    const deployed = await deployedBuild()
    if (deployed === __BUILD_ID__) {
      setPhase('current')
      return
    }

    // Either a newer build is deployed, or the network could not be reached to
    // rule it out. Both end in a reload: offline it costs a repaint from the
    // cache, and online it is the point.
    setPhase('updating')
    try {
      const registration =
        'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
      if (registration) {
        await registration.update()
        // Reloading mid-install would be served by the worker on its way out,
        // handing back the very build we are trying to leave.
        const incoming = registration.installing ?? registration.waiting
        if (incoming) await settled(incoming)
      }
    } catch {
      // A worker that cannot be updated is no reason not to reload; the page
      // may still be behind a worker that already has the newer copy.
    }
    window.location.reload()
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
