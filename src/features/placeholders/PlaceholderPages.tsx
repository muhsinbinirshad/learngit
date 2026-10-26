import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip, Dialog, Eyebrow, Icon, ProgressBar, Switch } from '@/design-system/components'
import { allItems, completedIds, itemState, labs, lessons, tracksById, trackUnlock, SKILL_LABELS } from '@/content'
import { useProgress } from '@/features/progress/store'
import { usePreferences } from './preferences'
import { TrackCover } from '@/features/tracks/TrackCover'
import { cn } from '@/design-system/cn'

function useSnapshot() {
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  return { labs: labsProgress, lessons: lessonsProgress }
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

function PageFrame({
  eyebrow,
  title,
  lead,
  aside,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  lead: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10">
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 text-2xl font-medium leading-10 tracking-tight">{title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-on-surface-variant">{lead}</p>
        </div>
        {aside}
      </header>
      <div className="mt-8">{children}</div>
    </div>
  )
}

function Card({ title, icon, children, className }: { title?: string; icon?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-outline bg-background p-5', className)} aria-label={title}>
      {title && (
        <h2 className="mb-3 flex items-center gap-2 text-base font-medium">
          {icon && <Icon name={icon} size={20} className="text-on-surface-variant" />}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: 'success' | 'primary' | 'warning' | 'neutral' }) {
  const tones = {
    success: 'bg-success-container text-on-success-container',
    primary: 'bg-primary-container text-on-primary-container',
    warning: 'bg-warning-container text-on-warning-container',
    neutral: 'bg-surface-variant text-on-surface-variant',
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

/* ---------------------------------------------------------------------------------------------- */

export function AchievementsPage() {
  const snapshot = useSnapshot()
  const completed = completedIds(snapshot)
  const labsDone = labs.filter((l) => completed.has(l.id))
  const lessonsDone = lessons.filter((l) => completed.has(l.id))
  const commands = Object.values(snapshot.labs).reduce((n, p) => n + p.commandsRun, 0)
  const seconds = Object.values(snapshot.labs).reduce((n, p) => n + p.elapsedSeconds, 0)
  const hintFree = labsDone.filter((l) => Object.values(snapshot.labs[l.id]?.hintsUsed ?? {}).every((n) => n === 0)).length
  const skillCounts = new Map<string, number>()
  for (const l of labsDone) for (const sk of l.skills) skillCounts.set(sk, (skillCounts.get(sk) ?? 0) + 1)
  const skills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1])
  const next = allItems.find((i) => ['open', 'current'].includes(itemState(i, snapshot, completed)))

  return (
    <PageFrame
      eyebrow="Achievements"
      title={
        <>
          What you have earned <span className="font-mono text-xl font-normal text-primary">so far.</span>
        </>
      }
      lead="Everything here is counted from real work in your browser: lessons passed, labs completed, commands run. Badges, the skill map and certificates will read from these same numbers."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="menu_book" label="Lessons passed" value={`${lessonsDone.length} / ${lessons.length}`} tone="primary" />
        <StatTile icon="task_alt" label="Labs completed" value={`${labsDone.length} / ${labs.length}`} tone="success" />
        <StatTile icon="terminal" label="Commands run" value={String(commands)} tone="neutral" />
        <StatTile icon="timer" label="Time practising" value={formatMinutes(seconds)} tone="warning" />
      </ul>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Skills practised" icon="psychology">
          {skills.length === 0 ? (
            <div className="flex items-start gap-4 rounded-md bg-surface p-4">
              <TrackCover trackId="foundations" size="sm" />
              <div>
                <p className="text-sm font-medium">No skills recorded yet</p>
                <p className="mt-1 text-sm text-on-surface-variant">Each completed lab adds the skills it practises here.</p>
                {next && (
                  <Link to={next.href} className="mt-3 inline-block hover:no-underline">
                    <Button size="sm" variant="tonal" trailingIcon="arrow_forward" tabIndex={-1}>
                      {next.type === 'lesson' ? 'Read' : 'Start'}: {next.title}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {skills.map(([skill, count]) => (
                <li key={skill} className="flex items-center gap-3">
                  <span className="w-40 text-sm">{SKILL_LABELS[skill] ?? skill}</span>
                  <ProgressBar value={count} max={Math.max(3, skills[0]?.[1] ?? 1)} label={`${SKILL_LABELS[skill] ?? skill} practice`} className="flex-1" />
                  <span className="w-16 text-right font-mono text-xs text-on-surface-variant">
                    {count} lab{count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Highlights" icon="military_tech">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <Icon
                name={labsDone.length ? 'check_circle' : 'radio_button_unchecked'}
                size={20}
                className={labsDone.length ? 'text-success' : 'text-on-surface-variant'}
                filled={!!labsDone.length}
              />
              <span>
                First lab completed
                <span className="block text-xs text-on-surface-variant">{labsDone[0] ? labsDone[0].title : 'Finish any lab'}</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Icon
                name={hintFree ? 'check_circle' : 'radio_button_unchecked'}
                size={20}
                className={hintFree ? 'text-success' : 'text-on-surface-variant'}
                filled={!!hintFree}
              />
              <span>
                Hint-free lab
                <span className="block text-xs text-on-surface-variant">
                  {hintFree ? `${hintFree} lab${hintFree === 1 ? '' : 's'} without a single hint` : 'Complete a lab without opening hints'}
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Icon
                name={trackUnlock('foundations', completed).unlocked ? 'check_circle' : 'radio_button_unchecked'}
                size={20}
                className={trackUnlock('foundations', completed).unlocked ? 'text-success' : 'text-on-surface-variant'}
                filled={trackUnlock('foundations', completed).unlocked}
              />
              <span>
                Prerequisites done
                <span className="block text-xs text-on-surface-variant">All six "Before you start" lessons</span>
              </span>
            </li>
          </ul>
          <p className="mt-4 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
            Badges with rarity, the skill map and downloadable certificates arrive with the progress release. Nothing you do now is lost.
          </p>
        </Card>
      </div>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const HUB_FEATURES = [
  { icon: 'folder_data', title: 'Repositories', text: 'A shared copy of your project that teammates and bots push to.' },
  { icon: 'call_merge', title: 'Pull requests', text: 'Open one from a branch, read the diff, request changes, approve, merge or squash.' },
  { icon: 'rate_review', title: 'Reviews and comments', text: 'Scripted teammates leave comments exactly when the scenario needs them.' },
  { icon: 'bug_report', title: 'Issues', text: 'Tickets you link from commits and pull requests ("fixes #12").' },
  { icon: 'verified', title: 'CI checks', text: 'A simulated pipeline that goes green or red on every pull request.' },
  { icon: 'shield', title: 'Branch protection', text: 'Required reviews and code owners that block an unsafe merge.' },
]

/** Flat diagram of the Hub flow: branch → pull request → review → merge, in token colours. */
function HubDiagram() {
  return (
    <svg
      viewBox="0 0 320 120"
      width="320"
      height="120"
      role="img"
      aria-label="Diagram: a branch becomes a pull request, gets reviewed, and is merged into main"
      className="max-w-full"
    >
      <path d="M20 30 H300" stroke="#DADCE0" strokeWidth="3" strokeLinecap="round" />
      <path d="M90 30 C110 30 110 80 130 80 H200 C220 80 220 30 240 30" fill="none" stroke="#1A73E8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="30" r="7" fill="#fff" stroke="#5F6368" strokeWidth="3" />
      <circle cx="90" cy="30" r="7" fill="#fff" stroke="#5F6368" strokeWidth="3" />
      <circle cx="150" cy="80" r="7" fill="#fff" stroke="#1A73E8" strokeWidth="3" />
      <circle cx="195" cy="80" r="7" fill="#fff" stroke="#1A73E8" strokeWidth="3" />
      <circle cx="240" cy="30" r="8" fill="#188038" stroke="#188038" strokeWidth="3" />
      <circle cx="290" cy="30" r="7" fill="#fff" stroke="#5F6368" strokeWidth="3" />
      <rect x="128" y="96" width="90" height="18" rx="9" fill="#E8F0FE" />
      <text x="173" y="109" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#174EA6">
        pull request
      </text>
      <text x="40" y="14" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#5F6368">
        main
      </text>
      <text x="240" y="14" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#188038">
        merged
      </text>
    </svg>
  )
}

export function HubPage() {
  const snapshot = useSnapshot()
  const completed = completedIds(snapshot)
  const unlock = trackUnlock('remotes-collaboration', completed)
  const track = tracksById['remotes-collaboration']!
  const stepsBefore = allItems.filter((i) => tracksById[i.track]!.order < track.order)
  const doneBefore = stepsBefore.filter((i) => completed.has(i.id)).length
  const next = allItems.find((i) => ['open', 'current'].includes(itemState(i, snapshot, completed)))

  return (
    <PageFrame
      eyebrow="Hub · team simulation"
      title={
        <>
          Your team, simulated <span className="font-mono text-xl font-normal text-primary">offline.</span>
        </>
      }
      lead="Hub is a small code-hosting site built into Commit Lab. It behaves like the real ones (repositories, pull requests, reviews, issues, CI checks) and it has teammates who push and comment at the right moment in a scenario. No account needed."
      aside={<TrackCover trackId="remotes-collaboration" size="lg" title="Remotes & Collaboration cover" className="hidden sm:block" />}
    >
      <section className="rounded-lg border border-outline bg-background p-5 shadow-1" aria-labelledby="hub-status">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <Eyebrow>{unlock.unlocked ? 'Status' : 'Unlocks with'}</Eyebrow>
            <h2 id="hub-status" className="mt-2 text-base font-medium">
              {unlock.unlocked ? 'Hub is open' : `Track ${String(track.order).padStart(2, '0')} · ${track.title}`}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {unlock.unlocked
                ? 'Repositories appear here as the collaboration labs create them.'
                : `Finish the ${stepsBefore.length} steps before it to open Hub. ${doneBefore} done so far.`}
            </p>
            {!unlock.unlocked && <ProgressBar value={doneBefore} max={stepsBefore.length} label="Progress towards Hub" className="mt-3 max-w-xs" />}
            {next && !unlock.unlocked && (
              <Link to={next.href} className="mt-4 inline-block hover:no-underline">
                <Button trailingIcon="arrow_forward" tabIndex={-1}>
                  {next.type === 'lesson' ? 'Read' : 'Start'}: {next.title}
                </Button>
              </Link>
            )}
          </div>
          <HubDiagram />
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <Eyebrow>What Hub gives you</Eyebrow>
        <span className="h-px flex-1 bg-outline" aria-hidden />
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_FEATURES.map((f) => (
          <li key={f.title} className="flex gap-3 rounded-lg border border-outline bg-background p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-container text-on-primary-container">
              <Icon name={f.icon} size={20} />
            </span>
            <span>
              <span className="block text-sm font-medium">{f.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-on-surface-variant">
        Hub never talks to GitHub, GitLab or any network. Everything you practise on it transfers directly to those platforms.
      </p>
    </PageFrame>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export function SettingsPage() {
  const { reduceMotion, setReduceMotion, terminalFontSize, setTerminalFontSize } = usePreferences()
  const [confirm, setConfirm] = useState(false)
  const snapshot = useSnapshot()
  const labsWithProgress = Object.values(snapshot.labs).filter((p) => p.status !== 'not-started').length
  const lessonsDone = Object.keys(snapshot.lessons).length
  const clearAll = async () => {
    useProgress.setState({ labs: {}, lessons: {}, lastLabId: null })
    try {
      localStorage.removeItem('commitlab.progress')
      const dbs = (await indexedDB.databases?.()) ?? []
      for (const db of dbs) if (db.name?.startsWith('commitlab-')) indexedDB.deleteDatabase(db.name)
    } catch {
      /* best effort */
    }
    setConfirm(false)
  }
  const exportProgress = () => {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), ...useProgress.getState() }, (_k, v) => (typeof v === 'function' ? undefined : v), 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'commit-lab-progress.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageFrame
      eyebrow="Settings"
      title={
        <>
          Preferences <span className="font-mono text-xl font-normal text-primary">and your data.</span>
        </>
      }
      lead="Commit Lab keeps everything in this browser. These settings change how it looks and let you take your progress with you or wipe it."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Display" icon="tune">
          <div className="flex flex-col gap-5">
            <Switch
              label="Reduce motion"
              description="Turns off panel transitions, graph animation and confetti. Follows your system setting by default."
              checked={reduceMotion}
              onChange={setReduceMotion}
            />
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm">Terminal font size</span>
                <span className="block text-xs text-on-surface-variant">Applies the next time a lab opens.</span>
              </span>
              <div className="flex items-center gap-1" role="group" aria-label="Terminal font size">
                {[12, 13, 14, 16].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={terminalFontSize === n ? 'tonal' : 'outlined'}
                    aria-pressed={terminalFontSize === n}
                    onClick={() => setTerminalFontSize(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Learning" icon="school">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3">
              <Icon name="lock_open" size={20} className="text-on-surface-variant" />
              <span>
                Steps unlock in order
                <span className="block text-xs text-on-surface-variant">
                  Each lesson or lab opens when the previous one is complete. This keeps the course readable for beginners and is not adjustable.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Icon name="lightbulb" size={20} className="text-on-surface-variant" />
              <span>
                Hints are always available
                <span className="block text-xs text-on-surface-variant">
                  Three levels per objective. Hint use is recorded only so you can see where you leaned on help.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Icon name="undo" size={20} className="text-on-surface-variant" />
              <span>
                Undo and Reset in every lab
                <span className="block text-xs text-on-surface-variant">Nothing you do in a lab is permanent. Experiment freely.</span>
              </span>
            </li>
          </ul>
        </Card>

        <Card title="Your data" icon="database" className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm text-on-surface-variant">
                Stored in this browser: <span className="font-mono text-on-surface">{lessonsDone}</span> lesson{lessonsDone === 1 ? '' : 's'} passed,{' '}
                <span className="font-mono text-on-surface">{labsWithProgress}</span> lab{labsWithProgress === 1 ? '' : 's'} with progress, plus one repository
                database per lab you opened. Nothing is sent to a server.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip icon="cloud_off">Offline</Chip>
                <Chip icon="lock">Local only</Chip>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outlined" icon="download" onClick={exportProgress}>
                Export progress
              </Button>
              <Button variant="danger" icon="delete" onClick={() => setConfirm(true)}>
                Delete everything
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete all local data?"
        description="Progress for every lesson and lab, and every in-browser repository, will be removed. This cannot be undone."
        size="sm"
        actions={
          <>
            <Button variant="text" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clearAll}>
              Delete everything
            </Button>
          </>
        }
      />
    </PageFrame>
  )
}
