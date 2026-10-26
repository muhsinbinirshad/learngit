import { Link, useLocation } from 'react-router-dom'
import { itemsForTrack, tracks, tracksById, completedIds, itemState, type ResolvedItem } from '@/content'
import { useProgress } from '@/features/progress/store'
import { Eyebrow, Icon, ProgressBar } from '@/design-system/components'
import { TrackCover } from './TrackCover'
import { cn } from '@/design-system/cn'

/**
 * Learning sidebar: the current track as a stepper of lessons and labs, then what unlocks next.
 * Workspace navigation (Achievements, Hub, Settings) lives in the top app bar.
 */
export function TrackSidebar({ trackId }: { trackId: string }) {
  const track = tracksById[trackId]
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  const progress = { labs: labsProgress, lessons: lessonsProgress }
  const location = useLocation()
  if (!track) return null
  const items = itemsForTrack(track.id)
  const completed = completedIds(progress)
  const done = items.filter((i) => completed.has(i.id)).length
  const nextTrack = tracks.find((t) => t.order === track.order + 1)
  const onOverview = location.pathname === `/tracks/${track.id}`
  const firstOpen = items.find((i) => ['open', 'current'].includes(itemState(i, progress, completed)))

  return (
    <nav aria-label="Learning navigation" className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-outline bg-background">
      <Link
        to={`/tracks/${track.id}`}
        aria-current={onOverview ? 'page' : undefined}
        className={cn('m-3 flex items-center gap-3 rounded-md p-2 hover:no-underline', onOverview ? 'bg-primary-container' : 'hover:bg-surface-variant')}
      >
        <TrackCover trackId={track.id} size="sm" />
        <span className="min-w-0">
          <span className="block font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">Track {String(track.order).padStart(2, '0')}</span>
          <span className="block truncate text-sm font-medium text-on-surface">{track.title}</span>
          <span className="block font-mono text-[11px] text-on-surface-variant">
            {done}/{items.length} done
          </span>
        </span>
      </Link>
      <div className="px-5">
        <ProgressBar value={done} max={items.length} label="Track progress" />
      </div>

      <ol className="mt-4 px-3" aria-label="Lessons and labs in order">
        {items.map((item, i) => (
          <StepRow
            key={item.id}
            item={item}
            index={i}
            last={i === items.length - 1}
            state={itemState(item, progress, completed)}
            active={location.pathname === item.href}
            highlight={item.id === firstOpen?.id}
          />
        ))}
      </ol>

      {nextTrack && (
        <div className="mt-auto border-t border-outline-variant p-3">
          <Eyebrow className="mb-2">Up next</Eyebrow>
          <div className="flex items-center gap-3 rounded-md bg-surface p-2">
            <TrackCover trackId={nextTrack.id} size="sm" muted={done < items.length} />
            <span className="min-w-0">
              <span className="block truncate text-sm text-on-surface">{nextTrack.title}</span>
              <span className="block font-mono text-[11px] text-on-surface-variant">
                {done < items.length ? 'unlocks when this track is complete' : 'unlocked'}
              </span>
            </span>
          </div>
        </div>
      )}
    </nav>
  )
}

function StepRow({
  item,
  index,
  last,
  state,
  active,
  highlight,
}: {
  item: ResolvedItem
  index: number
  last: boolean
  state: ReturnType<typeof itemState>
  active: boolean
  highlight: boolean
}) {
  const circle =
    state === 'done' ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-on-primary">
        <Icon name="check" size={16} />
      </span>
    ) : state === 'locked' ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-outline bg-surface text-on-surface-variant">
        <Icon name="lock" size={16} />
      </span>
    ) : (
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-[11px] font-medium',
          highlight ? 'border-primary text-primary' : 'border-outline text-on-surface-variant',
        )}
      >
        {index + 1}
      </span>
    )
  const meta =
    state === 'done'
      ? 'done'
      : state === 'locked'
        ? 'finish the previous step'
        : state === 'current'
          ? 'in progress'
          : `${item.type === 'lesson' ? 'read' : 'lab'} · ${item.estimatedMinutes} min`
  const body = (
    <>
      <span className="relative flex flex-col items-center">
        {circle}
        {!last && <span className={cn('mt-1 h-full min-h-6 w-px', state === 'done' ? 'bg-success' : 'bg-outline')} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 pb-4">
        <span
          className={cn(
            'flex items-center gap-1.5 text-sm leading-5',
            state === 'locked' ? 'text-on-surface-variant' : 'text-on-surface',
            active && 'font-medium',
          )}
        >
          <Icon name={item.type === 'lesson' ? 'menu_book' : 'terminal'} size={16} className="shrink-0 text-on-surface-variant" />
          <span className="truncate">{item.title}</span>
        </span>
        <span className="block pl-[22px] font-mono text-[11px] text-on-surface-variant">{meta}</span>
      </span>
    </>
  )
  return (
    <li>
      {state === 'locked' ? (
        <div className="flex gap-3 px-2" aria-label={`${item.title}, locked`}>
          {body}
        </div>
      ) : (
        <Link
          to={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn('flex gap-3 rounded-md px-2 hover:bg-surface-variant hover:no-underline', active && 'bg-surface-variant')}
        >
          {body}
        </Link>
      )}
    </li>
  )
}
