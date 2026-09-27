import { CHANGELOG } from '@/lib/changelog'
import { formatWithYear } from '@/lib/dates'

/**
 * What has changed lately, one bullet at a time.
 *
 * Bullets rather than the hairline this used to hang the lines off. A rule down
 * the left says "these belong together", which is the wrong thing to say about
 * a list read by skipping: a dot in front of every line is where the eye
 * returns to, and half of these are a sentence long.
 */
export function Changelog() {
  return (
    <div className="space-y-4">
      {CHANGELOG.map((release) => (
        <div key={release.on}>
          <p className="type-data text-[11px] text-muted-foreground/70">{formatWithYear(release.on)}</p>
          <ul className="mt-1.5 space-y-1.5">
            {release.lines.map((line) => (
              <li key={line} className="flex gap-2">
                {/* Sized off the line's own type so it sits on the first line's
                    x-height rather than drifting as the text wraps. */}
                <span
                  aria-hidden
                  className="mt-[0.5em] size-1 shrink-0 rounded-full bg-muted-foreground/50"
                />
                <span className="text-xs leading-relaxed text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
