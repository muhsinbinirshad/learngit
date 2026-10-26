/**
 * Owns everything about one running lab: the filesystem, shell, repository model,
 * objective progress, undo snapshots and the debrief replay log. Framework-agnostic;
 * React subscribes through `useLabSession`.
 */
import type { FsClient, Snapshot } from '@/engine/fs'
import { exists, snapshot as takeSnapshot, restore as restoreSnapshot } from '@/engine/fs'
import { Repo } from '@/engine/git/repo'
import { buildGraphModel, type GraphModel } from '@/engine/git/graph'
import { computeStatus, type RepoStatus } from '@/engine/git/worktree'
import { readIndex } from '@/engine/git/tree'
import { Shell } from '@/engine/shell/shell'
import type { EditorRequest, RunResult, ShellEvent } from '@/engine/shell/types'
import { stripAnsi } from '@/engine/shell/format'
import { seedLab, readLabels } from '@/engine/scenario/seed'
import type { LabDefinition } from '@/engine/scenario/types'
import { applyStickiness, evaluateObjectives, type ObjectiveResult } from '@/engine/validator'

export const HOME = '/home/learner'

export interface RepoModel {
  exists: boolean
  graph: GraphModel | null
  status: RepoStatus | null
  branches: string[]
  indexPaths: string[]
}

export interface TerminalLine {
  kind: 'input' | 'output' | 'system'
  text: string
}

export interface ReplayStep {
  command: string
  graph: GraphModel | null
  objectivesMet: string[]
}

export interface PendingEditor extends EditorRequest {
  resolve: (value: string | null) => void
}

export interface SessionState {
  ready: boolean
  busy: boolean
  cwd: string
  displayPath: string
  repo: RepoModel
  objectives: Record<string, boolean>
  freshResults: ObjectiveResult[]
  terminal: TerminalLine[]
  pendingEditor: PendingEditor | null
  prompt: string | null
  replay: ReplayStep[]
  canUndo: boolean
  completedAt: number | null
  error: string | null
}

type Listener = (state: SessionState) => void

interface UndoEntry {
  fs: Snapshot
  objectives: Record<string, boolean>
  terminal: TerminalLine[]
  replayLength: number
  cwd: string
}

export class LabSession {
  readonly lab: LabDefinition
  readonly fs: FsClient
  shell!: Shell
  private listeners = new Set<Listener>()
  private undo: UndoEntry[] = []
  private labels: Record<string, string> = {}
  state: SessionState

  constructor(lab: LabDefinition, fs: FsClient, initialObjectives: Record<string, boolean> = {}) {
    this.lab = lab
    this.fs = fs
    this.state = {
      ready: false,
      busy: false,
      cwd: `${HOME}/${lab.workspace.projectDir}`,
      displayPath: `~/${lab.workspace.projectDir}`,
      repo: { exists: false, graph: null, status: null, branches: [], indexPaths: [] },
      objectives: initialObjectives,
      freshResults: [],
      terminal: [],
      pendingEditor: null,
      prompt: null,
      replay: [],
      canUndo: false,
      completedAt: null,
      error: null,
    }
  }

  get repoDir(): string {
    return `${HOME}/${this.lab.workspace.projectDir}`
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l(this.state)
  }

  /** Seed or resume. `resume` reuses on-disk state when the project directory exists. */
  async init(resume: boolean): Promise<void> {
    const hasProject = await exists(this.fs, this.repoDir)
    if (!resume || !hasProject) {
      await seedLab(this.fs, this.lab, HOME)
      this.labels = await readLabels(this.fs, HOME, this.lab.id)
      this.set({
        objectives: {},
        terminal: [{ kind: 'system', text: `Welcome to ${this.lab.scenario.company}. Type \`help\` for the shell reference.` }],
        replay: [],
      })
    } else {
      this.labels = await readLabels(this.fs, HOME, this.lab.id)
      this.set({ terminal: [{ kind: 'system', text: 'Resumed your previous session. Your files and history are exactly as you left them.' }] })
    }
    this.shell = new Shell({
      fs: this.fs,
      home: HOME,
      cwd: this.repoDir,
      io: { openEditor: (req) => this.openEditor(req) },
    })
    await this.refresh()
    const fresh = await evaluateObjectives(this.lab.objectives, this.validationCtx())
    const objectives = applyStickiness(this.lab.objectives, this.state.objectives, fresh)
    const graph = this.state.repo.graph
    this.set({
      ready: true,
      objectives,
      freshResults: fresh,
      replay: this.state.replay.length
        ? this.state.replay
        : [{ command: 'Starting state', graph, objectivesMet: Object.keys(objectives).filter((k) => objectives[k]) }],
    })
  }

  private validationCtx() {
    return { fs: this.fs, repoDir: this.repoDir, labels: this.labels }
  }

  /** Called by the shell when a command needs the editor (commit message, rebase todo). */
  private openEditor(req: EditorRequest): Promise<string | null> {
    return new Promise((resolve) => {
      this.set({
        pendingEditor: {
          ...req,
          resolve: (v) => {
            this.set({ pendingEditor: null })
            resolve(v)
          },
        },
      })
    })
  }

  async refresh(): Promise<void> {
    const repo = new Repo(this.fs, this.repoDir)
    const repoExists = await repo.exists()
    let model: RepoModel
    if (repoExists) {
      const [graph, status, branches, index] = await Promise.all([buildGraphModel(repo), computeStatus(repo), repo.listBranches(), readIndex(repo)])
      model = { exists: true, graph, status, branches, indexPaths: [...index.keys()] }
    } else {
      model = { exists: false, graph: null, status: null, branches: [], indexPaths: [] }
    }
    this.set({ repo: model, cwd: this.shell?.cwd ?? this.repoDir, displayPath: this.shell?.displayPath() ?? `~/${this.lab.workspace.projectDir}` })
  }

  /** Run a shell line typed by the learner (or issued by UI mode). */
  async run(input: string, opts: { source?: 'terminal' | 'ui' } = {}): Promise<RunResult> {
    if (this.state.busy) return { output: [], exitCode: 1, events: [] }
    const wasInteractive = !!this.state.prompt
    this.set({ busy: true, error: null })
    try {
      if (!wasInteractive) await this.pushUndo()
      const result = await this.shell.run(input)
      const terminal = [...this.state.terminal]
      terminal.push({ kind: 'input', text: input })
      for (const line of result.output) terminal.push({ kind: 'output', text: line })
      if (opts.source === 'ui' && !result.prompt) terminal.push({ kind: 'system', text: `(run from the UI panel; equivalent command shown above)` })
      if (result.events.some((e: ShellEvent) => e.type === 'clear')) terminal.length = 0
      this.set({ terminal: terminal.slice(-2000), prompt: result.prompt ?? null })
      await this.refresh()
      if (!result.prompt) await this.evaluate(input)
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.set({ terminal: [...this.state.terminal, { kind: 'output', text: `Commit Lab: unexpected error: ${message}` }], error: message })
      return { output: [], exitCode: 1, events: [] }
    } finally {
      this.set({ busy: false })
    }
  }

  /** Re-evaluate objectives after a change made outside the shell (e.g. saving a file). */
  async evaluate(command?: string): Promise<void> {
    const fresh = await evaluateObjectives(this.lab.objectives, this.validationCtx())
    const objectives = applyStickiness(this.lab.objectives, this.state.objectives, fresh)
    const allMet = this.lab.objectives.every((o) => objectives[o.id])
    const replay = command
      ? [...this.state.replay, { command, graph: this.state.repo.graph, objectivesMet: this.lab.objectives.filter((o) => objectives[o.id]).map((o) => o.id) }]
      : this.state.replay
    this.set({ objectives, freshResults: fresh, replay, completedAt: allMet ? (this.state.completedAt ?? Date.now()) : this.state.completedAt })
  }

  /** Save a file from the editor; refreshes state and objectives. */
  async writeFile(path: string, content: string): Promise<void> {
    await this.pushUndo()
    const { writeFileDeep } = await import('@/engine/fs')
    await writeFileDeep(this.fs, path, content)
    await this.refresh()
    await this.evaluate()
  }

  async readFile(path: string): Promise<string | null> {
    const { readTextOrNull } = await import('@/engine/fs')
    return readTextOrNull(this.fs, path)
  }

  private async pushUndo(): Promise<void> {
    const snap = await takeSnapshot(this.fs, HOME)
    this.undo.push({ fs: snap, objectives: this.state.objectives, terminal: this.state.terminal, replayLength: this.state.replay.length, cwd: this.shell.cwd })
    if (this.undo.length > 30) this.undo.shift()
    this.set({ canUndo: true })
  }

  async undoLast(): Promise<boolean> {
    const entry = this.undo.pop()
    if (!entry) return false
    this.set({ busy: true })
    try {
      await restoreSnapshot(this.fs, HOME, entry.fs)
      this.shell.cwd = entry.cwd
      const fresh = await evaluateObjectives(this.lab.objectives, this.validationCtx())
      const objectives = applyStickiness(this.lab.objectives, entry.objectives, fresh)
      this.set({
        terminal: [...entry.terminal, { kind: 'system', text: 'Undid the last step. Files and repository restored.' }],
        objectives,
        freshResults: fresh,
        replay: this.state.replay.slice(0, entry.replayLength),
        prompt: null,
        canUndo: this.undo.length > 0,
      })
      await this.refresh()
      return true
    } finally {
      this.set({ busy: false })
    }
  }

  async reset(): Promise<void> {
    this.set({ busy: true })
    try {
      this.undo = []
      await seedLab(this.fs, this.lab, HOME)
      this.labels = await readLabels(this.fs, HOME, this.lab.id)
      this.shell.cwd = this.repoDir
      this.set({
        terminal: [{ kind: 'system', text: 'Lab reset. The repository is back to its starting state.' }],
        objectives: {},
        replay: [],
        prompt: null,
        canUndo: false,
        completedAt: null,
        pendingEditor: null,
      })
      await this.refresh()
      const fresh = await evaluateObjectives(this.lab.objectives, this.validationCtx())
      const objectives = applyStickiness(this.lab.objectives, {}, fresh)
      this.set({ objectives, freshResults: fresh, replay: [{ command: 'Starting state', graph: this.state.repo.graph, objectivesMet: [] }] })
    } finally {
      this.set({ busy: false })
    }
  }

  /** Plain-text transcript of commands run so far (for the debrief). */
  commandSummary(): { command: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const l of this.state.terminal) {
      if (l.kind !== 'input') continue
      const key = stripAnsi(l.text).trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].map(([command, count]) => ({ command, count }))
  }
}
