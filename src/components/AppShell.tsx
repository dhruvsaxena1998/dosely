import { NavLink, Outlet } from 'react-router-dom'
import { CalendarCheck, History, Pill, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Today', icon: CalendarCheck, end: true },
  { to: '/medicines', label: 'Medicines', icon: Pill, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false },
]

export function AppShell() {
  return (
    <div className="mx-auto flex h-dvh max-h-full w-full max-w-md flex-col overflow-hidden">
      {/* iOS lays the page out below the status bar but does not clip what
          scrolls up into it, so a document-scrolled list paints through the
          strip while the stuck header stays pinned under it. A real scroll
          container clips its own content, which no amount of painting from
          inside the header could do. */}
      <main className="flex-1 overflow-y-auto overscroll-contain pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background">
        <div className="mx-auto flex w-full max-w-md items-stretch pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1.5 py-3.5 transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className={cn('size-[18px]', isActive && 'stroke-[2.5]')} />
                  <span className="type-eyebrow text-[10px]">{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
