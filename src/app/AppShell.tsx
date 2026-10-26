import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon, IconButton, Menu, SidebarNav, TopAppBar } from '@/design-system/components'
import { cn } from '@/design-system/cn'
import { labs, tracks, tracksById, lessonsById, trackUnlock, completedIds } from '@/content'
import { useProgress } from '@/features/progress/store'
import { applyMotionPreference, usePreferences } from '@/features/placeholders/preferences'
import { TrackSidebar } from '@/features/tracks/TrackPage'

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md text-on-surface hover:no-underline focus-visible:outline-none" aria-label="Commit Lab home">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1A73E8" />
        <circle cx="11" cy="10" r="3" fill="#fff" />
        <circle cx="11" cy="22" r="3" fill="#fff" />
        <circle cx="21" cy="16" r="3" fill="#fff" />
        <path d="M11 13v6M11 13c0 4 10 0 10 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {!compact && <span className="font-mono text-sm font-medium tracking-tight">commit lab</span>}
    </Link>
  )
}

const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/tracks', label: 'Tracks', icon: 'route' },
  { to: '/achievements', label: 'Achievements', icon: 'workspace_premium' },
  { to: '/hub', label: 'Hub', icon: 'hub' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function LabsCounter() {
  const progress = useProgress((s) => s.labs)
  const done = labs.filter((l) => progress[l.id]?.status === 'completed').length
  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-full border border-outline bg-background px-3 font-mono text-xs text-on-surface"
      aria-label={`${done} of ${labs.length} labs completed`}
    >
      <span className="font-medium">{done}</span>
      <span className="text-on-surface-variant">/ {labs.length} labs</span>
    </span>
  )
}

function TopLink({
  to,
  icon,
  label,
  badge,
  iconOnly,
  active,
}: {
  to: string
  icon: string
  label: string
  badge?: string
  iconOnly?: boolean
  active: boolean
}) {
  return (
    <Link
      to={to}
      aria-label={iconOnly ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full text-sm font-medium transition-standard hover:no-underline',
        iconOnly ? 'w-8 justify-center rounded-md' : 'px-3',
        active ? 'bg-surface-variant text-on-surface' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
      )}
    >
      <Icon name={icon} size={18} filled={active} />
      {!iconOnly && label}
      {badge && (
        <span className="ml-0.5 rounded-full bg-primary-container px-1.5 font-mono text-[10px] uppercase tracking-wide text-on-primary-container">{badge}</span>
      )}
    </Link>
  )
}

const SkipLink = () => (
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-2"
  >
    Skip to content
  </a>
)

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const reduceMotion = usePreferences((s) => s.reduceMotion)
  const progress = useProgress((s) => s.labs)
  const lessonProgress = useProgress((s) => s.lessons)
  const doneIds = completedIds({ labs: progress, lessons: lessonProgress })
  useEffect(() => applyMotionPreference(reduceMotion), [reduceMotion])
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('commitlab.nav.collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('commitlab.nav.collapsed', collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const path = location.pathname
  const inLab = path.startsWith('/labs/')
  const isHome = path === '/'
  const lessonId = path.startsWith('/lessons/') ? path.split('/')[2] : undefined
  const trackId = path.startsWith('/tracks/') ? path.split('/')[2] : lessonId ? lessonsById[lessonId]?.track : undefined
  const track = trackId ? tracksById[trackId] : undefined

  if (inLab) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <SkipLink />
        <main id="main" className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    )
  }

  // Home: centred top navigation, no sidebar.
  if (isHome) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        <SkipLink />
        <TopAppBar
          contained
          leading={
            <>
              <Wordmark />
              <nav aria-label="Primary" className="flex items-center gap-1">
                {NAV.filter((n) => n.label !== 'Settings').map((n) => {
                  const active = n.end ? path === n.to : path.startsWith(n.to)
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-standard hover:no-underline',
                        active ? 'bg-surface-variant text-on-surface' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
                      )}
                    >
                      {n.label}
                      {n.label === 'Hub' && (
                        <span className="ml-1.5 rounded-full bg-primary-container px-1.5 font-mono text-[10px] uppercase tracking-wide text-on-primary-container">
                          team sim
                        </span>
                      )}
                    </Link>
                  )
                })}
              </nav>
            </>
          }
          trailing={
            <>
              <LabsCounter />
              <Link
                to="/settings"
                aria-label="Settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-on-surface-variant transition-standard hover:bg-surface-variant hover:text-on-surface"
              >
                <Icon name="settings" size={20} />
              </Link>
            </>
          }
        />
        <main id="main" className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    )
  }

  // Section pages: top bar with context switcher, sidebar on the left.
  const sectionLabel = track
    ? track.title
    : path.startsWith('/design')
      ? 'Design system'
      : (NAV.find((n) => (n.end ? path === n.to : path.startsWith(n.to.split('/').slice(0, 2).join('/'))))?.label ?? 'Commit Lab')
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <SkipLink />
      <TopAppBar
        leading={
          <>
            <Wordmark compact />
            <span className="text-outline" aria-hidden>
              |
            </span>
            {track ? (
              <Menu
                label="Switch track"
                trigger={(p) => (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-on-surface hover:bg-surface-variant"
                    {...p}
                  >
                    <Icon name="route" size={18} className="text-on-surface-variant" />
                    {track.title}
                    <Icon name="unfold_more" size={16} className="text-on-surface-variant" />
                  </button>
                )}
                items={tracks.map((t) => {
                  const u = trackUnlock(t.id, doneIds)
                  return {
                    id: t.id,
                    label: t.title,
                    icon: u.unlocked ? 'route' : 'lock',
                    disabled: !u.unlocked,
                    description: u.unlocked ? `${t.items.length} steps` : `Unlocks after ${u.requires?.title ?? ''}`,
                    onSelect: () => navigate(`/tracks/${t.id}`),
                  }
                })}
              />
            ) : (
              <span className="text-sm font-medium text-on-surface">{sectionLabel}</span>
            )}
            {track && (
              <span className="hidden font-mono text-[11px] uppercase tracking-wide text-on-surface-variant md:inline">{lessonId ? 'lesson' : 'overview'}</span>
            )}
          </>
        }
        trailing={
          <>
            <nav aria-label="Workspace" className="hidden items-center gap-1 md:flex">
              <TopLink to="/achievements" icon="workspace_premium" label="Achievements" active={path.startsWith('/achievements')} />
              <TopLink to="/hub" icon="hub" label="Hub" badge="team sim" active={path.startsWith('/hub')} />
            </nav>
            <LabsCounter />
            <TopLink to="/settings" icon="settings" label="Settings" iconOnly active={path.startsWith('/settings')} />
            <IconButton icon="home" label="Home" onClick={() => navigate('/')} />
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {track ? <TrackSidebar trackId={track.id} /> : <SidebarNav items={NAV} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />}
        <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
