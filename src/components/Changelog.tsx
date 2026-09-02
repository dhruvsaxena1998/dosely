import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CHANGELOG } from '@/lib/changelog'
import { formatWithYear } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * What has changed lately, under the build the phone is running.
 *
 * Shut until asked for. The build id above it is the line people come to this
 * section to read, and a list of things already installed would push it up the
 * screen every visit to answer a question nobody had. The press keeps the
 * shape of a section heading — caps, a rule, and now a chevron — so it reads as
 * part of Version rather than as a section of its own.
 */
export function Changelog() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="changelog-entries"
        className="flex w-full items-center gap-3 rounded-lg py-0.5 text-left transition-opacity active:opacity-60"
      >
        <span className="type-eyebrow text-muted-foreground">What&apos;s new</span>
        <span className="h-px flex-1 bg-border" />
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id="changelog-entries" className="mt-3 space-y-3.5">
          {CHANGELOG.map((release) => (
            <div key={release.on}>
              <p className="type-data text-[11px] text-muted-foreground/70">{formatWithYear(release.on)}</p>
              {/* A hairline down the left does the work a bullet would, and
                  keeps the lines reading as one dated group. */}
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
      ) : null}
    </div>
  )
}
