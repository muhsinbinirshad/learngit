import { useState } from 'react'
import type { LabDefinition, Objective } from '@/engine/scenario/types'
import { Button, Icon, Markdown, Chip, inline, toast } from '@/design-system/components'
import { cn } from '@/design-system/cn'
import { useProgress } from '@/features/progress/store'

const HINT_LEVELS = ['Nudge', 'Concept', 'Exact steps']
/** Stable reference so the selector never returns a fresh object (which would loop the store). */
const NO_HINTS: Record<string, number> = {}

/** Controls the Mission panel needs for a Real-mode (github) lab; omitted for sandbox labs. */
export interface RealModeControls {
  /** Resolved repository URL once provisioned, or null while it is being set up. */
  repoUrl: string | null
  /** A check is currently running against GitHub. */
  checking: boolean
  /** Click handler for "Check my work". */
  onCheck: () => void
}

/** The Mission panel only needs live objective status from the session, not the whole state. */
export interface MissionState {
  objectives: Record<string, boolean>
}

export function MissionPanel({ lab, state, realMode }: { lab: LabDefinition; state: MissionState; realMode?: RealModeControls }) {
  const hintsUsed = useProgress((s) => s.labs[lab.id]?.hintsUsed ?? NO_HINTS)
  const revealHint = useProgress((s) => s.revealHint)
  const met = lab.objectives.filter((o) => state.objectives[o.id]).length
  const [briefOpen, setBriefOpen] = useState(true)
  const [briefExpanded, setBriefExpanded] = useState(false)
  const firstOpen = lab.objectives.find((o) => !state.objectives[o.id])?.id ?? null

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className="border-b border-outline bg-background px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          {lab.scenario.company} · {lab.scenario.role}
        </p>
        <h1 className="mt-1 text-lg font-medium leading-7">{lab.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <Icon name="schedule" size={16} /> about {lab.estimatedMinutes} min
          </span>
          <span aria-hidden>·</span>
          <span>
            {met}/{lab.objectives.length} objectives
          </span>
        </div>
      </div>

      <section className="border-b border-outline bg-background" aria-labelledby="brief-heading">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-on-surface hover:bg-surface-variant"
          aria-expanded={briefOpen}
          aria-controls="brief-body"
          onClick={() => setBriefOpen((o) => !o)}
        >
          <span id="brief-heading">Brief</span>
          <Icon name={briefOpen ? 'expand_less' : 'expand_more'} size={20} className="text-on-surface-variant" />
        </button>
        {briefOpen && (
          <div id="brief-body" className="px-4 pb-3">
            <div className={cn('relative overflow-hidden', !briefExpanded && 'max-h-56')}>
              <Markdown text={lab.scenario.brief} />
              {!briefExpanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" aria-hidden />
              )}
            </div>
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary hover:underline"
              aria-expanded={briefExpanded}
              onClick={() => setBriefExpanded((e) => !e)}
            >
              {briefExpanded ? 'Show less' : 'Read the full brief'}
            </button>
          </div>
        )}
      </section>

      {lab.mode === 'github' && lab.realMode && realMode && <RealModeSection lab={lab} controls={realMode} />}

      <section className="px-4 py-3" aria-labelledby="objectives-heading">
        <h2 id="objectives-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          Objectives
        </h2>
        <ol className="flex flex-col gap-2">
          {lab.objectives.map((o, i) => (
            <ObjectiveItem
              key={o.id}
              index={i + 1}
              objective={o}
              met={!!state.objectives[o.id]}
              current={o.id === firstOpen}
              hintLevel={hintsUsed[o.id] ?? 0}
              onReveal={(level) => revealHint(lab.id, o.id, level)}
            />
          ))}
        </ol>
      </section>

      <section className="mt-auto border-t border-outline px-4 py-3" aria-labelledby="why-heading">
        <h2 id="why-heading" className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          <Icon name="work" size={16} /> Why this matters at work
        </h2>
        <p className="text-sm leading-6 text-on-surface-variant">{lab.scenario.whyItMatters}</p>
      </section>
    </div>
  )
}

/**
 * Real-mode labs run on the learner's own machine or a Codespace against a real GitHub repo, so the
 * Mission panel — not an in-browser terminal — carries the setup: what to do, the repo link, the
 * commands to copy, and a button to re-check objective status against GitHub.
 */
function RealModeSection({ lab, controls }: { lab: LabDefinition; controls: RealModeControls }) {
  const { setup, commands } = lab.realMode!
  const fill = (cmd: string) => cmd.replace(/\{\{repoUrl\}\}/g, controls.repoUrl ?? '<your-repo-url>')
  return (
    <section className="border-b border-outline bg-background px-4 py-3" aria-labelledby="realmode-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="realmode-heading" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          <Icon name="cloud" size={16} /> Real GitHub lab
        </h2>
        <Chip tone="neutral">Runs on github.com</Chip>
      </div>

      {controls.repoUrl ? (
        <a
          href={controls.repoUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Icon name="open_in_new" size={16} /> Open your lab repository
        </a>
      ) : (
        <p className="text-sm text-on-surface-variant">Your lab repository is being prepared…</p>
      )}

      <ol className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-on-surface">
        {setup.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-on-surface-variant">{i + 1}.</span>
            <span className="min-w-0">{inline(step)}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-col gap-1.5">
        {commands.map((cmd, i) => (
          <CopyRow key={i} text={fill(cmd)} />
        ))}
      </div>

      <Button
        className="mt-3 w-full"
        icon={controls.checking ? 'progress_activity' : 'fact_check'}
        disabled={controls.checking || !controls.repoUrl}
        onClick={controls.onCheck}
      >
        {controls.checking ? 'Checking against GitHub…' : 'Check my work'}
      </Button>
    </section>
  )
}

function CopyRow({ text }: { text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ tone: 'success', title: 'Copied to clipboard' })
    } catch {
      toast({ tone: 'error', title: 'Could not copy', description: 'Select the command and copy it manually.' })
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-variant px-2.5 py-1.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs text-on-surface">{text}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy command: ${text}`}
        className="shrink-0 rounded-sm p-1 text-on-surface-variant hover:bg-surface hover:text-on-surface"
      >
        <Icon name="content_copy" size={16} />
      </button>
    </div>
  )
}

function ObjectiveItem({
  index,
  objective,
  met,
  current,
  hintLevel,
  onReveal,
}: {
  index: number
  objective: Objective
  met: boolean
  current: boolean
  hintLevel: number
  onReveal: (level: number) => void
}) {
  const [open, setOpen] = useState(false)
  const maxHints = objective.hints.length
  const revealed = objective.hints.slice(0, hintLevel)
  return (
    <li
      className={cn(
        'rounded-lg border bg-background transition-standard',
        met ? 'border-outline-variant' : current ? 'border-primary shadow-1' : 'border-outline',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-standard',
            met ? 'border-success bg-success text-on-primary' : current ? 'border-primary text-primary' : 'border-outline text-on-surface-variant',
          )}
          role="img"
          aria-label={met ? 'Completed' : current ? 'Current objective' : 'Not started'}
        >
          {met ? <Icon name="check" size={16} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium leading-5', met ? 'text-on-surface-variant' : 'text-on-surface')}>{inline(objective.title)}</p>
          {objective.description && !met && <p className="mt-1 text-xs leading-5 text-on-surface-variant">{inline(objective.description)}</p>}
          {!met && (
            <div className="mt-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
              >
                <Icon name="lightbulb" size={16} />
                {hintLevel ? `Hints (${hintLevel}/${maxHints})` : 'Need a hint?'}
                <Icon name={open ? 'expand_less' : 'expand_more'} size={16} />
              </button>
              {open && (
                <div className="mt-2 flex flex-col gap-2">
                  {revealed.map((h, i) => (
                    <div key={i} className="rounded-md bg-surface-variant p-2.5">
                      <div className="mb-1 flex items-center gap-2">
                        <Chip tone="neutral">{HINT_LEVELS[i] ?? `Hint ${i + 1}`}</Chip>
                      </div>
                      <p className="text-xs leading-5 text-on-surface">{inline(h)}</p>
                    </div>
                  ))}
                  {hintLevel < maxHints ? (
                    <Button size="sm" variant="text" icon="add" onClick={() => onReveal(hintLevel + 1)} className="self-start">
                      {hintLevel === 0 ? 'Show a nudge' : hintLevel === 1 ? 'Explain the concept' : 'Show exact steps'}
                    </Button>
                  ) : (
                    <p className="text-xs text-on-surface-variant">All hints shown. Hint use is recorded so you can see where you leaned on help.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
