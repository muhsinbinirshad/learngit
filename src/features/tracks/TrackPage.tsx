import { Link, Navigate, useParams } from 'react-router-dom'
import { itemsForTrack, tracks, tracksById, trackUnlock, completedIds, itemState, trackMinutes, trackModes, labsById, SKILL_LABELS } from '@/content'
import type { LabMode } from '@/engine/scenario/types'
import { useProgress } from '@/features/progress/store'
import { Button, Chip, Eyebrow, Icon, ProgressBar } from '@/design-system/components'
import { NotFoundPage } from '@/app/NotFoundPage'
import { TrackCover } from './TrackCover'
import { cn } from '@/design-system/cn'

export { TrackSidebar } from './TrackSidebar'

/** /tracks with no id: send the learner to the first track that still has work. */
export function TracksIndex() {
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  const progress = { labs: labsProgress, lessons: lessonsProgress }
  const completed = completedIds(progress)
  const target = tracks.find((t) => trackUnlock(t.id, completed).unlocked && t.items.some((i) => !completed.has(i.id))) ?? tracks[0]!
  return <Navigate to={`/tracks/${target.id}`} replace />
}

/** Sandbox / Real GitHub badge. Real-mode labs run on real GitHub; sandbox labs run in the browser. */
function ModeBadge({ mode, small }: { mode: LabMode; small?: boolean }) {
  const github = mode === 'github'
  return (
    <Chip tone={github ? 'primary' : 'neutral'} icon={github ? 'cloud' : 'computer'} className={small ? 'h-5 text-[10px]' : undefined}>
      {github ? 'Real GitHub' : 'Sandbox'}
    </Chip>
  )
}

export function TrackPage() {
  const { trackId = '' } = useParams()
  const track = tracksById[trackId]
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  const progress = { labs: labsProgress, lessons: lessonsProgress }
  if (!track) return <NotFoundPage />
  const items = itemsForTrack(track.id)
  const completed = completedIds(progress)
  const done = items.filter((i) => completed.has(i.id)).length
  const current = items.find((i) => itemState(i, progress, completed) === 'current') ?? null
  const cta = current ?? items.find((i) => itemState(i, progress, completed) === 'open') ?? null
  const unlock = trackUnlock(track.id, completed)
  const lessonsCount = items.filter((i) => i.type === 'lesson').length
  const labsCount = items.length - lessonsCount

  if (!unlock.unlocked) {
    const prev = unlock.requires!
    const prevItems = itemsForTrack(prev.id)
    const prevDone = prevItems.filter((i) => completed.has(i.id)).length
    return (
      <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10">
        <Eyebrow>Track {String(track.order).padStart(2, '0')} · locked</Eyebrow>
        <div className="mt-4 flex items-start gap-6 rounded-lg border border-outline bg-background p-6">
          <TrackCover trackId={track.id} size="lg" muted title={`${track.title} cover`} />
          <div className="min-w-0">
            <h1 className="text-xl font-medium">{track.title}</h1>
            <p className="mt-2 text-sm text-on-surface-variant">{track.description}</p>
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Icon name="lock" size={18} className="text-on-surface-variant" />
              <span>
                Tracks unlock in order. Finish <strong className="font-medium">{prev.title}</strong> ({prevDone}/{prevItems.length} steps done) to open this
                one.
              </span>
            </p>
            <Link to={`/tracks/${prev.id}`} className="mt-4 inline-block hover:no-underline">
              <Button trailingIcon="arrow_forward" tabIndex={-1}>
                Go to {prev.title}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10">
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <Eyebrow>Track {String(track.order).padStart(2, '0')}</Eyebrow>
          <h1 className="mt-3 text-2xl font-medium leading-10 tracking-tight">
            {track.title}
            <span className="block font-mono text-xl font-normal text-primary">
              {lessonsCount && !labsCount ? 'read first, type later.' : 'one step at a time.'}
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-on-surface-variant">{track.description}</p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">
            {lessonsCount ? `${lessonsCount} lesson${lessonsCount === 1 ? '' : 's'}` : ''}
            {lessonsCount && labsCount ? ' · ' : ''}
            {labsCount ? `${labsCount} lab${labsCount === 1 ? '' : 's'}` : ''}
            {items.length ? ` · about ${trackMinutes(track.id)} min` : ''}
          </p>
          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trackModes(track.id).map((m) => (
                <ModeBadge key={m} mode={m} />
              ))}
            </div>
          )}
        </div>
        <TrackCover trackId={track.id} size="lg" title={`${track.title} cover`} className="hidden sm:block" />
      </header>

      {items.length > 0 && (
        <section className="mt-8 rounded-lg border border-outline bg-background p-5 shadow-1" aria-labelledby="track-progress">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <Eyebrow>Your progress</Eyebrow>
              <h2 id="track-progress" className="mt-2 text-base font-medium">
                {done === 0 ? 'Nothing finished yet.' : done === items.length ? 'Track complete.' : `${done} of ${items.length} steps complete.`}
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {done === items.length
                  ? 'Revisit anything below, or move on to the next track.'
                  : 'Steps open one at a time. Finish the current one to unlock the next.'}
              </p>
              <ProgressBar value={done} max={items.length} label="Track progress" className="mt-3 max-w-xs" />
            </div>
            {cta && (
              <Link to={cta.href} className="hover:no-underline">
                <Button trailingIcon="arrow_forward" tabIndex={-1}>
                  {current ? 'Resume' : cta.type === 'lesson' ? 'Read' : 'Start'}: {cta.title}
                </Button>
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-outline bg-background p-5" aria-labelledby="structure">
        <Eyebrow>Steps in this track</Eyebrow>
        <h2 id="structure" className="sr-only">
          Lessons and labs in this track
        </h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            The lessons and labs for this track are being prepared. Your progress so far carries over when they land.
          </p>
        ) : (
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map((item, i) => {
              const state = itemState(item, progress, completed)
              const lab = item.type === 'lab' ? labsById[item.id] : undefined
              const p = lab ? progress.labs[lab.id] : undefined
              const met = lab ? Object.values((p as { objectives?: Record<string, boolean> } | undefined)?.objectives ?? {}).filter(Boolean).length : 0
              const inner = (
                <>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs text-on-surface-variant">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'flex items-center gap-1.5 text-sm font-medium',
                          state === 'done' || state === 'locked' ? 'text-on-surface-variant' : 'text-on-surface',
                        )}
                      >
                        <Icon name={item.type === 'lesson' ? 'menu_book' : 'terminal'} size={16} className="shrink-0 text-on-surface-variant" />
                        <span className="truncate">{item.title}</span>
                      </p>
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">
                        {item.type === 'lesson' ? 'read' : `lab · ${lab?.objectives.length ?? 0} objectives`} · {item.estimatedMinutes} min
                      </p>
                      {item.type === 'lab' && (
                        <div className="mt-1.5">
                          <ModeBadge mode={item.mode} small />
                        </div>
                      )}
                    </div>
                    {state === 'done' ? (
                      <Icon name="check_circle" size={18} className="text-success" filled />
                    ) : state === 'locked' ? (
                      <Icon name="lock" size={18} className="text-on-surface-variant" />
                    ) : (
                      <Icon
                        name="arrow_forward"
                        size={18}
                        className="text-on-surface-variant transition-standard group-hover:translate-x-0.5 group-hover:text-on-surface"
                      />
                    )}
                  </div>
                  {lab && <p className="mt-2 text-xs text-on-surface-variant">{lab.skills.map((s) => SKILL_LABELS[s] ?? s).join(', ')}</p>}
                  {state === 'current' && lab && (
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar value={met} max={lab.objectives.length} label="Objectives" className="flex-1" />
                      <span className="font-mono text-[11px] text-primary">
                        {met}/{lab.objectives.length}
                      </span>
                    </div>
                  )}
                  {state === 'locked' && (
                    <div className="mt-3">
                      <Chip icon="lock">Finish step {String(i).padStart(2, '0')} first</Chip>
                    </div>
                  )}
                </>
              )
              return (
                <li key={item.id}>
                  {state === 'locked' ? (
                    <div className="flex h-full flex-col rounded-md border border-dashed border-outline p-4" aria-label={`${item.title}, locked`}>
                      {inner}
                    </div>
                  ) : (
                    <Link
                      to={item.href}
                      className={cn(
                        'group flex h-full flex-col rounded-md border bg-background p-4 shadow-1 transition-standard hover:shadow-2 hover:no-underline focus-visible:outline-none',
                        state === 'done' ? 'border-success/40' : 'border-primary',
                      )}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
