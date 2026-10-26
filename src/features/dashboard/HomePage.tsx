import { Link } from 'react-router-dom'
import { labs, labsById, tracks, itemsForTrack, allItems, trackUnlock, itemState, completedIds, trackMinutes } from '@/content'
import { useProgress } from '@/features/progress/store'
import { Button, Chip, Eyebrow, Icon, ProgressBar } from '@/design-system/components'
import { TrackCover } from '@/features/tracks/TrackCover'
import { cn } from '@/design-system/cn'

export { Eyebrow }

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Colourful welcome mark: three commit nodes meeting, in the three accent colours. */
function WelcomeMark() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r="32" fill="#E8F0FE" />
      <path d="M20 18v28M20 32c0 8 24-2 24-12" stroke="#1A73E8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="18" r="5" fill="#1A73E8" />
      <circle cx="20" cy="46" r="5" fill="#188038" />
      <circle cx="44" cy="20" r="5" fill="#F9AB00" />
    </svg>
  )
}

export function HomePage() {
  const progress = useProgress((s) => s.labs)
  const lessonProgress = useProgress((s) => s.lessons)
  const lastLabId = useProgress((s) => s.lastLabId)
  const snapshot = { labs: progress, lessons: lessonProgress }
  const doneIds = completedIds(snapshot)
  const completed = labs.filter((l) => progress[l.id]?.status === 'completed').length
  const continueLab = lastLabId && labsById[lastLabId] && progress[lastLabId]?.status === 'in-progress' ? labsById[lastLabId] : null
  const nextItem = continueLab
    ? { title: continueLab.title, href: `/labs/${continueLab.id}`, type: 'lab' as const }
    : (allItems.find((i) => ['open', 'current'].includes(itemState(i, snapshot, doneIds))) ?? null)
  const commands = Object.values(progress).reduce((n, p) => n + p.commandsRun, 0)
  const seconds = Object.values(progress).reduce((n, p) => n + p.elapsedSeconds, 0)
  const started = doneIds.size > 0 || Object.values(progress).some((p) => p.status !== 'not-started')

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10">
      {/* Welcome */}
      <header className="flex flex-wrap items-center gap-4">
        <WelcomeMark />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-medium tracking-tight">Welcome back</h1>
          <Chip mono>learner</Chip>
          {nextItem && (
            <Link to={nextItem.href} className="hover:no-underline">
              <Button variant="outlined" size="sm" trailingIcon="arrow_forward" tabIndex={-1}>
                {continueLab ? 'Resume' : nextItem.type === 'lesson' ? 'Read' : 'Start'}: {nextItem.title}
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Your tracks */}
      <section className="mt-10" aria-labelledby="your-tracks">
        <h2 id="your-tracks" className="text-base font-medium">
          Your tracks
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {tracks.map((t) => {
            const items = itemsForTrack(t.id)
            const done = items.filter((i) => doneIds.has(i.id)).length
            const lessonsCount = items.filter((i) => i.type === 'lesson').length
            const labsCount = items.length - lessonsCount
            const next = items.find((i) => itemState(i, snapshot, doneIds) === 'current') ?? items.find((i) => itemState(i, snapshot, doneIds) === 'open')
            const complete = items.length > 0 && done === items.length
            const unlock = trackUnlock(t.id, doneIds)
            const locked = !unlock.unlocked
            return (
              <article
                key={t.id}
                aria-label={`${t.title}${locked ? ', locked' : ''}`}
                className={cn('flex flex-col rounded-lg border border-outline bg-background p-4 transition-standard', !locked && 'hover:shadow-1')}
              >
                <div className="flex gap-4">
                  {locked ? (
                    <TrackCover trackId={t.id} size="md" muted />
                  ) : (
                    <Link to={`/tracks/${t.id}`} className="rounded-[6px] focus-visible:outline-none">
                      <TrackCover trackId={t.id} size="md" />
                      <span className="sr-only">{t.title} track</span>
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-medium">
                        <span className="mr-2 font-mono text-xs text-on-surface-variant">{String(t.order).padStart(2, '0')}</span>
                        {locked ? (
                          <span className="text-on-surface-variant">{t.title}</span>
                        ) : (
                          <Link to={`/tracks/${t.id}`} className="text-on-surface hover:text-primary hover:no-underline">
                            {t.title}
                          </Link>
                        )}
                      </h3>
                      {locked ? (
                        <Chip icon="lock">Locked</Chip>
                      ) : (
                        <Link to={next ? next.href : `/tracks/${t.id}`} className="shrink-0 hover:no-underline">
                          <Button size="sm" variant={complete ? 'outlined' : 'filled'} tabIndex={-1}>
                            {complete ? 'Review' : done ? 'Continue' : 'Start'}
                          </Button>
                        </Link>
                      )}
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-on-surface-variant">
                      {items.length > 0 ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="checklist" size={16} />
                            <span className="font-medium text-on-surface">{done}</span>/{items.length} steps
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="schedule" size={16} /> {trackMinutes(t.id)} min
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="menu_book" size={16} /> {t.tagline.split(',').length} modules
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 truncate text-sm text-on-surface-variant">
                      {locked
                        ? `Unlocks after ${unlock.requires?.title ?? 'the previous track'}`
                        : next
                          ? `${done ? 'Next' : 'Start with'}: ${next.title}`
                          : items.length
                            ? 'Every step complete.'
                            : t.tagline}
                    </p>
                  </div>
                </div>
                {items.length > 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    <ProgressBar value={done} max={items.length} label={`${t.title} progress`} className="flex-1" />
                    <span className="font-mono text-[11px] text-on-surface-variant">{Math.round((done / items.length) * 100)}%</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {items.length > 0 && (
                    <Chip>
                      {lessonsCount ? `${lessonsCount} lesson${lessonsCount === 1 ? '' : 's'}` : ''}
                      {lessonsCount && labsCount ? ' · ' : ''}
                      {labsCount ? `${labsCount} lab${labsCount === 1 ? '' : 's'}` : ''}
                    </Chip>
                  )}
                  {t.tagline
                    .split(',')
                    .slice(0, 2)
                    .map((tag) => {
                      const text = tag.trim()
                      return (
                        <Chip key={tag} tone={locked ? 'neutral' : 'primary'}>
                          {text.charAt(0).toUpperCase() + text.slice(1)}
                        </Chip>
                      )
                    })}
                  {complete && (
                    <Chip tone="success" icon="check">
                      Complete
                    </Chip>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Banner */}
      <section className="mt-10 overflow-hidden rounded-lg border border-outline bg-primary-container/40" aria-labelledby="how">
        <div className="grid items-center gap-6 p-6 md:grid-cols-[260px_1fr] md:p-8">
          <div className="relative mx-auto h-44 w-56" aria-hidden>
            <TrackCover trackId="recovery" size="lg" className="absolute left-0 top-6 -rotate-12" />
            <TrackCover trackId="branching-merging" size="lg" className="absolute left-14 top-0 shadow-2" />
            <TrackCover trackId="foundations" size="lg" className="absolute left-28 top-6 rotate-12" />
          </div>
          <div>
            <h2 id="how" className="text-lg font-medium">
              Learn Git the way <span className="font-mono text-on-primary-container">teams use it.</span>
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                'Real repository, real commands, in your browser',
                'Objectives check the repository, not what you typed',
                'Terminal or buttons, your choice, with the command shown',
                'A debrief with graph replay after every lab',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-on-surface">
                  <Icon name="check" size={18} className="mt-0.5 text-success" />
                  {t}
                </li>
              ))}
            </ul>
            {nextItem && (
              <Link to={nextItem.href} className="mt-4 inline-block hover:no-underline">
                <Button variant="outlined" tabIndex={-1} trailingIcon="arrow_forward">
                  {started ? 'Keep going' : 'Start with the first lesson'}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Progress at a glance */}
      <section className="mt-10" aria-labelledby="glance">
        <div className="flex items-center gap-2">
          <Icon name="monitoring" size={18} className="text-on-surface-variant" />
          <Eyebrow>Your progress at a glance</Eyebrow>
        </div>
        <h2 id="glance" className="sr-only">
          Progress at a glance
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat icon="task_alt" label="Labs completed" value={`${completed} / ${labs.length}`} tone="success" />
          <Stat icon="terminal" label="Commands run" value={String(commands)} tone="primary" />
          <Stat icon="timer" label="Time practising" value={formatMinutes(seconds)} tone="warning" />
        </ul>
      </section>
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: 'success' | 'primary' | 'warning' }) {
  const tones = {
    success: 'bg-success-container text-on-success-container',
    primary: 'bg-primary-container text-on-primary-container',
    warning: 'bg-warning-container text-on-warning-container',
  }
  return (
    <li className="flex items-center gap-3 rounded-lg border border-outline bg-background p-4">
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-md', tones[tone])}>
        <Icon name={icon} size={20} />
      </span>
      <span>
        <span className="block text-xs text-on-surface-variant">{label}</span>
        <span className="block font-mono text-lg text-on-surface">{value}</span>
      </span>
    </li>
  )
}
