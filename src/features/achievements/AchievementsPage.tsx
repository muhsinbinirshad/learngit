import { Card, Chip, Eyebrow, Icon } from '@/design-system/components'
import { BADGES, earnedSandboxBadges, type Badge } from '@/content/badges'
import { completedIds } from '@/content'
import { useProgress } from '@/features/progress/store'
import { cn } from '@/design-system/cn'

export function AchievementsPage() {
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  const realModeBadges = useProgress((s) => s.realModeBadges)

  const completed = completedIds({ labs: labsProgress, lessons: lessonsProgress })
  const sandboxEarned = new Set(earnedSandboxBadges(completed))
  const githubEarned = new Set(realModeBadges)
  const isEarned = (b: Badge) => (b.source === 'github' ? githubEarned.has(b.id) : sandboxEarned.has(b.id))
  const earnedCount = BADGES.filter(isEarned).length

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10">
      <header className="mb-8">
        <Eyebrow>Achievements</Eyebrow>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Your badges</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          {earnedCount} of {BADGES.length} earned. Badges marked <span className="font-medium text-primary">Real GitHub</span> are earned by doing real
          work on github.com and sync to every device you sign in on.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BADGES.map((b) => (
          <BadgeCard key={b.id} badge={b} earned={isEarned(b)} />
        ))}
      </div>
    </div>
  )
}

function BadgeCard({ badge, earned }: { badge: Badge; earned: boolean }) {
  const github = badge.source === 'github'
  return (
    <Card className={cn('flex flex-col gap-2', !earned && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            earned ? (github ? 'bg-primary text-on-primary' : 'bg-success text-on-primary') : 'bg-surface-variant text-on-surface-variant',
          )}
        >
          <Icon name={earned ? badge.icon : 'lock'} size={24} filled={earned} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-on-surface">{badge.title}</p>
          <p className="text-xs text-on-surface-variant">{earned ? 'Earned' : 'Locked'}</p>
        </div>
      </div>
      <p className="text-xs leading-5 text-on-surface-variant">{badge.description}</p>
      {github && (
        <div>
          <Chip tone="primary" icon="cloud">
            Real GitHub
          </Chip>
        </div>
      )}
    </Card>
  )
}
