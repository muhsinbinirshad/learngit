import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LabDefinition } from '@/engine/scenario/types'
import type { LabSession, SessionState } from './session/LabSession'
import { Button, Icon, IconButton, Chip, inline } from '@/design-system/components'
import { CommitGraph } from './graph/CommitGraph'
import { useProgress } from '@/features/progress/store'
import { nextLab, SKILL_LABELS } from '@/content'
import { cn } from '@/design-system/cn'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Post-lab debrief: what you did, what Git did (with replay), commands, mistakes, at work. */
export function DebriefView({ lab, session, state, onClose }: { lab: LabDefinition; session: LabSession; state: SessionState; onClose: () => void }) {
  const progress = useProgress((s) => s.labs[lab.id])
  const markSeen = useProgress((s) => s.update)
  const next = nextLab(lab.id)
  const [step, setStep] = useState(state.replay.length - 1)
  const replay = state.replay
  const current = replay[Math.min(step, replay.length - 1)]
  const commands = useMemo(() => session.commandSummary(), [session])
  const hintsUsed = Object.values(progress?.hintsUsed ?? {}).reduce((a, b) => a + b, 0)

  useEffect(() => {
    markSeen(lab.id, { debriefSeen: true })
  }, [lab.id, markSeen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="debrief-title">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-outline px-4">
        <div className="flex items-center gap-3">
          <Icon name="check_circle" size={20} className="text-success" />
          <h2 id="debrief-title" className="text-base font-medium">
            Lab complete: {lab.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="text" size="sm" onClick={onClose}>
            Keep exploring
          </Button>
          <IconButton icon="close" label="Close debrief" onClick={onClose} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-8">
            <section>
              <p className="text-sm leading-6 text-on-surface">{lab.debrief.summary}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Objectives" value={`${lab.objectives.length}/${lab.objectives.length}`} />
                <Stat label="Commands run" value={String(progress?.commandsRun ?? 0)} />
                <Stat label="Hints used" value={String(hintsUsed)} good={hintsUsed === 0} />
                <Stat label="Time" value={formatDuration(progress?.elapsedSeconds ?? 0)} sub={`target ${lab.estimatedMinutes} min`} />
              </dl>
            </section>

            <Section title="What you did" icon="task_alt">
              <ol className="flex flex-col gap-2">
                {lab.objectives.map((o) => (
                  <li key={o.id} className="flex items-start gap-2 text-sm">
                    <Icon name="check" size={18} className="mt-0.5 text-success" />
                    <span>{inline(o.title)}</span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="What Git did internally" icon="memory">
              <ol className="flex flex-col gap-3">
                {lab.debrief.internals.map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-variant font-mono text-[11px] text-on-surface-variant">
                      {i + 1}
                    </span>
                    <span>{inline(t)}</span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Command summary" icon="terminal">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">Worth remembering</h4>
                  <ul className="flex flex-col gap-2">
                    {lab.debrief.keyCommands.map((c) => (
                      <li key={c.command} className="rounded-md border border-outline p-2.5">
                        <code className="block font-mono text-xs text-on-surface">{c.command}</code>
                        <p className="mt-1 text-xs text-on-surface-variant">{c.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">What you ran</h4>
                  {commands.length ? (
                    <ul className="max-h-72 overflow-y-auto rounded-md border border-outline bg-surface p-2 font-mono text-xs">
                      {commands.map((c) => (
                        <li key={c.command} className="flex justify-between gap-3 py-0.5">
                          <span className="truncate text-on-surface">{c.command}</span>
                          {c.count > 1 && <span className="text-on-surface-variant">×{c.count}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-on-surface-variant">
                      You completed this lab from the UI panel; the equivalent commands appeared in the terminal.
                    </p>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Common mistakes" icon="report">
              <ul className="flex flex-col gap-2">
                {lab.debrief.commonMistakes.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-6">
                    <Icon name="remove" size={18} className="mt-0.5 text-on-surface-variant" />
                    <span>{inline(m)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="How this shows up at work" icon="work">
              <p className="text-sm leading-6">{inline(lab.debrief.atWork)}</p>
              {lab.debrief.interview && (
                <div className="mt-3 rounded-md bg-surface-variant p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    <Icon name="record_voice_over" size={16} /> In interviews
                  </p>
                  <p className="text-sm leading-6">{inline(lab.debrief.interview)}</p>
                </div>
              )}
            </Section>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-lg border border-outline">
              <div className="flex items-center justify-between border-b border-outline px-3 py-2">
                <h3 className="text-sm font-medium">Graph replay</h3>
                <span className="text-xs text-on-surface-variant">
                  {Math.min(step, replay.length - 1) + 1}/{replay.length}
                </span>
              </div>
              <div className="px-3 py-2">
                <code className="block truncate rounded-sm bg-surface-variant px-2 py-1 font-mono text-xs" title={current?.command}>
                  {current?.command}
                </code>
                <div className="mt-2 flex items-center gap-2">
                  <IconButton icon="skip_previous" label="First step" size="sm" onClick={() => setStep(0)} disabled={step === 0} />
                  <IconButton icon="chevron_left" label="Previous step" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} />
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, replay.length - 1)}
                    value={Math.min(step, replay.length - 1)}
                    onChange={(e) => setStep(Number(e.target.value))}
                    aria-label="Replay step"
                    className="flex-1 accent-primary"
                  />
                  <IconButton
                    icon="chevron_right"
                    label="Next step"
                    size="sm"
                    onClick={() => setStep((s) => Math.min(replay.length - 1, s + 1))}
                    disabled={step >= replay.length - 1}
                  />
                  <IconButton icon="skip_next" label="Last step" size="sm" onClick={() => setStep(replay.length - 1)} disabled={step >= replay.length - 1} />
                </div>
              </div>
              <div className="max-h-[360px] overflow-auto border-t border-outline-variant">
                {current?.graph && current.graph.nodes.length ? (
                  <CommitGraph model={current.graph} selected={null} onSelect={() => undefined} compact />
                ) : (
                  <p className="p-4 text-sm text-on-surface-variant">No commits yet at this step.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-outline p-4">
              <h3 className="text-sm font-medium">Skills practised</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lab.skills.map((s) => (
                  <Chip key={s} tone="primary">
                    {SKILL_LABELS[s] ?? s}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {next ? (
                  <Link to={`/labs/${next.id}`} className="hover:no-underline">
                    <Button className="w-full" trailingIcon="arrow_forward" tabIndex={-1}>
                      Next lab: {next.title}
                    </Button>
                  </Link>
                ) : (
                  <p className="text-sm text-on-surface-variant">You have finished every available lab. More tracks are on the way.</p>
                )}
                <Link to={`/tracks/${lab.track}`} className="hover:no-underline">
                  <Button variant="outlined" className="w-full" tabIndex={-1}>
                    Back to track
                  </Button>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-base font-medium">
        <Icon name={icon} size={20} className="text-on-surface-variant" /> {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded-md border border-outline p-3">
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className={cn('mt-1 text-lg font-medium', good && 'text-success')}>{value}</dd>
      {sub && <dd className="text-xs text-on-surface-variant">{sub}</dd>}
    </div>
  )
}
