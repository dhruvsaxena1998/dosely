import { CHANGELOG } from '@/lib/changelog'
import { formatWithYear } from '@/lib/dates'

/**
 * What has changed lately.
 *
 * It used to be shut until asked for, because the build id sat directly above
 * it and was the line people came to that section to read — a list of things
 * already installed would have pushed it up the screen every visit to answer a
 * question nobody had. The build id is on the settings screen now and this has
 * a page of its own, reached by choosing to read exactly this, so a fold here
 * would be a lid on the only thing behind the door.
 */
export function Changelog() {
  return (
    <div className="space-y-3.5">
      {CHANGELOG.map((release) => (
        <div key={release.on}>
          <p className="type-data text-[11px] text-muted-foreground/70">{formatWithYear(release.on)}</p>
          {/* A hairline down the left does the work a bullet would, and keeps
              the lines reading as one dated group. */}
          <ul className="mt-1.5 space-y-1 border-l-[length:var(--border-weight)] border-border pl-3">
            {release.lines.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
