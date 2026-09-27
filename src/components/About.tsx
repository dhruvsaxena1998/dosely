import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Who made this, and where the code is.
 *
 * Read off the GitHub profile the repo already belongs to rather than invented
 * here, so there is one version of the answer. A local-first app with no
 * account and no server has nowhere else to put a name, and "no server" is
 * worth more from someone who signs it.
 */
const AUTHOR = {
  name: 'Dhruv Saxena',
  role: 'Full-stack JavaScript developer',
  place: 'Jaipur, India',
  github: 'https://github.com/dhruvsaxena1998',
  source: 'https://github.com/dhruvsaxena1998/dosely',
}

export function About() {
  return (
    <section>
      <h2 className="type-display text-lg">Dosely</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A daily medicine checklist. It answers one question fast: did I already take this?
      </p>

      <div className="mt-5">
        <Heading>Made by</Heading>
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{AUTHOR.name}</p>
        <p className="type-data mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {AUTHOR.role}
          <span className="mx-1.5 opacity-40">/</span>
          {AUTHOR.place}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={AUTHOR.github}>GitHub</Link>
          <Link href={AUTHOR.source}>Source</Link>
        </div>
      </div>
    </section>
  )
}

/**
 * Out of the app and into a browser. An installed PWA has no address bar to
 * come back from, so these open beside it rather than navigating the one window
 * the app has and stranding someone on a page with no way back to their doses.
 */
function Link({ href, children }: { href: string; children: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
        <ExternalLink className="size-3.5" />
      </a>
    </Button>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h3 className="type-eyebrow text-muted-foreground">{children}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
