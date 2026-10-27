import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { LabDefinition } from '@/engine/scenario/types'
import { createCheckProvider } from '@/engine/validator'
import { labsById, tracksById, itemUnlock, completedIds } from '@/content'
import { Navigate } from 'react-router-dom'
import { NotFoundPage } from '@/app/NotFoundPage'
import { Button, Confetti, Dialog, SplitPane, Skeleton, toast } from '@/design-system/components'
import { useProgress } from '@/features/progress/store'
import { useLabSession } from './session/useLabSession'
import { LabPageSkeleton } from './LabPageSkeleton'
import { LabToolbar, type WorkMode } from './LabToolbar'
import { MissionPanel } from './MissionPanel'
import { TerminalPane } from './terminal/TerminalPane'
import { GraphPane } from './graph/GraphPane'
import { UiModePanel } from './UiModePanel'
import { DebriefView } from './DebriefView'
import { InlineMessage } from '@/design-system/components'

const EditorPane = lazy(() => import('./editor/EditorPane').then((m) => ({ default: m.EditorPane })))

export function LabPage() {
  const { labId = '' } = useParams()
  const lab = labsById[labId]
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  if (!lab) return <NotFoundPage />
  if (!itemUnlock(lab.id, completedIds({ labs: labsProgress, lessons: lessonsProgress })).unlocked) return <Navigate to={`/tracks/${lab.track}`} replace />
  // Real-mode labs run on GitHub: no in-browser engine, so a different, session-less workspace.
  return lab.mode === 'github' ? <RealModeWorkspace key={lab.id} lab={lab} /> : <LabWorkspace key={lab.id} labId={lab.id} />
}

/**
 * Workspace for a Real-mode (github) lab. There is no in-browser terminal; the Mission panel carries
 * setup, the repo link and clone commands, and "Check my work" validates against GitHub through the
 * GitHubProvider. Repo provisioning and live checking arrive with the Phase 5 backend; until then the
 * check path is wired and reports that honestly rather than faking a pass.
 */
function RealModeWorkspace({ lab }: { lab: LabDefinition }) {
  const [objectives, setObjectives] = useState<Record<string, boolean>>({})
  const [checking, setChecking] = useState(false)
  // Phase 5 provisions the repo and returns its URL; null means "not yet provisioned".
  const repoUrl: string | null = null
  const provider = useMemo(
    () => createCheckProvider('github', { github: { owner: 'ledgerly-labs', repo: lab.id, repoUrl: repoUrl ?? '' } }),
    [lab.id],
  )

  const onCheck = useCallback(async () => {
    setChecking(true)
    try {
      const results = await provider.evaluate(lab.objectives)
      setObjectives(Object.fromEntries(results.map((r) => [r.id, r.met])))
    } catch (e) {
      toast({ tone: 'info', title: 'Real-mode checking arrives in Phase 5', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setChecking(false)
    }
  }, [provider, lab.objectives])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto h-full w-full max-w-2xl border-x border-outline">
        <MissionPanel lab={lab} state={{ objectives }} realMode={{ repoUrl, checking, onCheck }} />
      </div>
    </div>
  )
}

function LabWorkspace({ labId }: { labId: string }) {
  const lab = labsById[labId]!
  const track = tracksById[lab.track]!
  const { session, state, fatal } = useLabSession(lab)
  const progressMode = useProgress((s) => s.labs[lab.id]?.mode ?? 'terminal')
  const updateProgress = useProgress((s) => s.update)
  const resetProgress = useProgress((s) => s.reset)
  const recordCommand = useProgress((s) => s.recordCommand)
  const addTime = useProgress((s) => s.addTime)

  const [mode, setMode] = useState<WorkMode>(progressMode)
  const [missionCollapsed, setMissionCollapsed] = useState(false)
  const [graphCollapsed, setGraphCollapsed] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [debriefOpen, setDebriefOpen] = useState(false)
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [focusTerminal, setFocusTerminal] = useState(0)
  const completionShown = useRef(false)
  const [celebrate, setCelebrate] = useState(0)

  const changeMode = (m: WorkMode) => {
    setMode(m)
    updateProgress(lab.id, { mode: m })
  }

  // Time on task: count seconds while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') addTime(lab.id, 5)
    }, 5000)
    return () => clearInterval(id)
  }, [lab.id, addTime])

  const met = lab.objectives.filter((o) => state?.objectives[o.id]).length
  const complete = !!state && met === lab.objectives.length

  useEffect(() => {
    if (!complete || completionShown.current) return
    completionShown.current = true
    setCelebrate((n) => n + 1)
    const seen = useProgress.getState().labs[lab.id]?.debriefSeen
    if (!seen) {
      const t = setTimeout(() => setDebriefOpen(true), 900)
      return () => clearTimeout(t)
    }
    toast({ tone: 'success', title: 'All objectives complete', action: { label: 'View debrief', onClick: () => setDebriefOpen(true) } })
  }, [complete, lab.id])

  const openFile = useCallback((path: string) => {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]))
    setActiveFile(path)
  }, [])
  const closeFile = useCallback((path: string) => {
    setOpenFiles((files) => {
      const next = files.filter((f) => f !== path)
      setActiveFile((a) => (a === path ? (next[next.length - 1] ?? null) : a))
      return next
    })
  }, [])

  const runCommand = useCallback(
    async (line: string, source: 'terminal' | 'ui') => {
      if (!session) return
      const r = await session.run(line, { source })
      if (line.trim()) recordCommand(lab.id)
      for (const e of r.events) if (e.type === 'open-file') openFile(e.path)
      return r
    },
    [session, lab.id, recordCommand, openFile],
  )

  // The terminal takes over while the shell waits on an interactive prompt (e.g. `git add -p`).
  const effectiveMode: WorkMode = state?.prompt ? 'terminal' : mode

  if (fatal) {
    return (
      <div className="p-8">
        <InlineMessage tone="error" title="The lab could not be started">
          <p className="mt-1 font-mono text-xs">{fatal}</p>
          <p className="mt-2">Reloading the page usually fixes this. If it keeps happening, reset the lab from the track page.</p>
        </InlineMessage>
      </div>
    )
  }
  if (!session || !state?.ready) return <LabPageSkeleton />

  const onReset = async () => {
    setResetOpen(false)
    setOpenFiles([])
    setActiveFile(null)
    completionShown.current = false
    resetProgress(lab.id)
    await session.reset()
    toast({ tone: 'info', title: 'Lab reset to its starting state' })
  }

  const onUndo = async () => {
    const ok = await session.undoLast()
    if (!ok) toast({ tone: 'info', title: 'Nothing to undo' })
  }

  return (
    <div className="relative flex h-full flex-col">
      <Confetti fire={celebrate} />
      <LabToolbar
        lab={lab}
        track={track}
        met={met}
        mode={effectiveMode}
        onMode={changeMode}
        canUndo={state.canUndo}
        busy={state.busy}
        onUndo={onUndo}
        onReset={() => setResetOpen(true)}
        onDebrief={() => setDebriefOpen(true)}
        complete={complete}
        missionCollapsed={missionCollapsed}
        graphCollapsed={graphCollapsed}
        onToggleMission={() => setMissionCollapsed((c) => !c)}
        onToggleGraph={() => setGraphCollapsed((c) => !c)}
      />
      <SplitPane
        direction="horizontal"
        initial={[0.26, 0.46, 0.28]}
        minPx={260}
        labels={['Mission', 'Workbench', 'Repository']}
        collapsed={[missionCollapsed, false, graphCollapsed]}
        storageKey="workspace"
      >
        <MissionPanel lab={lab} state={state} />
        <SplitPane
          direction="vertical"
          initial={[0.5, 0.5]}
          minPx={160}
          labels={['Editor', effectiveMode === 'terminal' ? 'Terminal' : 'Git actions']}
          storageKey="workbench"
        >
          <Suspense
            fallback={
              <div className="p-4">
                <Skeleton className="h-full min-h-40 w-full" label="Loading editor" />
              </div>
            }
          >
            <EditorPane
              session={session}
              state={state}
              openFiles={openFiles}
              activeFile={activeFile}
              onOpen={openFile}
              onClose={closeFile}
              onActivate={setActiveFile}
              onFocusTerminal={() => setFocusTerminal((n) => n + 1)}
            />
          </Suspense>
          {effectiveMode === 'terminal' ? (
            <TerminalPane session={session} state={state} onRun={(l) => runCommand(l, 'terminal')} focusSignal={focusTerminal} />
          ) : (
            <UiModePanel session={session} state={state} onRun={(l) => runCommand(l, 'ui')} onOpenFile={openFile} />
          )}
        </SplitPane>
        <GraphPane session={session} state={state} onOpenFile={openFile} />
      </SplitPane>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this lab?"
        description="Your files, commits and objective progress for this lab will be discarded and the repository re-seeded. Progress in other labs is not affected."
        size="sm"
        actions={
          <>
            <Button variant="text" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="restart_alt" onClick={onReset}>
              Reset lab
            </Button>
          </>
        }
      />
      {debriefOpen && <DebriefView lab={lab} session={session} state={state} onClose={() => setDebriefOpen(false)} />}
    </div>
  )
}
