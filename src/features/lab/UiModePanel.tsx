import { useState } from 'react'
import type { LabSession, SessionState } from './session/LabSession'
import type { RunResult } from '@/engine/shell/types'
import { stripAnsi } from '@/engine/shell/format'
import { Button, EmptyState, Icon, IconButton, InlineMessage, Menu, TextArea, TextField } from '@/design-system/components'
import { cn } from '@/design-system/cn'

interface Props {
  session: LabSession
  state: SessionState
  onRun: (line: string) => Promise<RunResult | undefined>
  onOpenFile: (path: string) => void
}

function quote(s: string): string {
  return `"${s.replace(/(["\\$`])/g, '\\$1')}"`
}

/** GUI-client style actions. Every button runs the real command and shows it, bridging learners toward the terminal. */
export function UiModePanel({ session, state, onRun, onOpenFile }: Props) {
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [creating, setCreating] = useState(false)
  const [last, setLast] = useState<{ command: string; output: string; ok: boolean } | null>(null)
  const st = state.repo.status
  const graph = state.repo.graph
  const branches = state.repo.branches
  const current = graph?.head.branch ?? null
  const busy = state.busy

  const run = async (command: string) => {
    const r = await onRun(command)
    if (!r) return
    setLast({ command, output: r.output.map(stripAnsi).join('\n').trim(), ok: r.exitCode === 0 })
    return r
  }

  if (!state.repo.exists) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <PanelHeader />
        <EmptyState
          compact
          icon="account_tree"
          title="No repository yet"
          description="Initialize one to start using the Git actions."
          action={
            <Button size="sm" icon="add" onClick={() => run('git init')} disabled={busy}>
              Initialize repository
            </Button>
          }
        />
        {last && <LastCommand last={last} />}
      </div>
    )
  }

  const unstaged = st ? [...st.conflicted, ...st.unstaged, ...st.untracked] : []
  const staged = st?.staged ?? []
  const stashes = graph?.refs.some((r) => r.kind === 'stash') ?? false
  const inOperation = graph?.state.merging || graph?.state.rebasing || graph?.state.cherryPicking || graph?.state.reverting

  const commit = async () => {
    const [subject, ...rest] = message.trim().split('\n')
    const body = rest.join('\n').trim()
    const cmd = body ? `git commit -m ${quote(subject ?? '')} -m ${quote(body)}` : `git commit -m ${quote(subject ?? '')}`
    const r = await run(cmd)
    if (r && r.exitCode === 0) setMessage('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <PanelHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-2">
        {/* Changes */}
        <section className="flex min-h-0 flex-col rounded-lg border border-outline bg-background" aria-labelledby="changes-h">
          <div className="flex h-9 items-center justify-between border-b border-outline px-3">
            <h3 id="changes-h" className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              Changes
            </h3>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="text" onClick={() => run('git add -A')} disabled={busy || unstaged.length === 0}>
                Stage all
              </Button>
              <Button size="sm" variant="text" onClick={() => run('git reset')} disabled={busy || staged.length === 0}>
                Unstage all
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <FileGroup
              title="Staged"
              empty="Nothing staged. Stage files below to include them in the next commit."
              items={staged.map((e) => ({
                path: e.path,
                code: e.staged === 'added' ? 'A' : e.staged === 'deleted' ? 'D' : 'M',
                tone: e.staged === 'deleted' ? 'error' : 'success',
              }))}
              actions={(path) => (
                <Button size="sm" variant="text" icon="remove" onClick={() => run(`git restore --staged ${quotePath(path)}`)} disabled={busy}>
                  Unstage
                </Button>
              )}
              onOpen={(p) => onOpenFile(`${session.repoDir}/${p}`)}
            />
            <FileGroup
              title="Unstaged"
              empty={st?.clean ? 'Working tree clean.' : 'No unstaged changes.'}
              items={unstaged.map((e) => ({
                path: e.path,
                code: e.conflicted ? 'UU' : e.untracked ? '??' : e.unstaged === 'deleted' ? 'D' : 'M',
                tone: e.conflicted ? 'error' : e.untracked ? 'success' : e.unstaged === 'deleted' ? 'error' : 'warning',
              }))}
              actions={(path, code) => (
                <>
                  {code !== '??' && code !== 'UU' && (
                    <Button size="sm" variant="text" icon="undo" onClick={() => run(`git restore ${quotePath(path)}`)} disabled={busy}>
                      Discard
                    </Button>
                  )}
                  <Button size="sm" variant="text" icon="add" onClick={() => run(`git add ${quotePath(path)}`)} disabled={busy}>
                    {code === 'UU' ? 'Mark resolved' : 'Stage'}
                  </Button>
                </>
              )}
              onOpen={(p) => onOpenFile(`${session.repoDir}/${p}`)}
            />
          </div>
          <div className="border-t border-outline p-3">
            <TextArea
              label="Commit message"
              placeholder={inOperation ? 'Finish the in-progress operation' : 'Subject line, then an optional body after a blank line'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              disabled={busy}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-on-surface-variant">
                {staged.length} file{staged.length === 1 ? '' : 's'} staged{current ? ` on ${current}` : ''}
              </span>
              {graph?.state.merging && graph.state.conflicts.length === 0 ? (
                <Button size="sm" icon="merge" onClick={() => run('git commit --no-edit')} disabled={busy}>
                  Finish merge
                </Button>
              ) : (
                <Button size="sm" icon="commit" onClick={commit} disabled={busy || !message.trim() || (staged.length === 0 && !inOperation)}>
                  Commit
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Branches and more */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="rounded-lg border border-outline bg-background p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Branches</h3>
              <Button size="sm" variant="text" icon="add" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
                New branch
              </Button>
            </div>
            {creating && (
              <form
                className="mt-2 flex items-end gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newBranch.trim()) return
                  const r = await run(`git switch -c ${newBranch.trim()}`)
                  if (r && r.exitCode === 0) {
                    setNewBranch('')
                    setCreating(false)
                  }
                }}
              >
                <TextField
                  label="Branch name"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="feature/short-name"
                  className="flex-1"
                />
                <Button size="sm" type="submit" disabled={busy || !newBranch.trim()}>
                  Create and switch
                </Button>
              </form>
            )}
            <ul className="mt-2 flex flex-col gap-1">
              {branches.map((b) => {
                const isCurrent = b === current
                return (
                  <li key={b} className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-sm', isCurrent && 'bg-primary-container')}>
                    <Icon name={isCurrent ? 'check' : 'commit'} size={16} className={isCurrent ? 'text-primary' : 'text-on-surface-variant'} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{b}</span>
                    {!isCurrent && (
                      <>
                        <Button size="sm" variant="text" onClick={() => run(`git switch ${b}`)} disabled={busy}>
                          Switch
                        </Button>
                        <Menu
                          label={`More actions for ${b}`}
                          align="right"
                          trigger={(p) => <IconButton icon="more_horiz" label={`More actions for ${b}`} size="sm" {...p} />}
                          items={[
                            {
                              id: 'merge',
                              label: `Merge ${b} into ${current ?? 'HEAD'}`,
                              icon: 'merge',
                              onSelect: () => run(`git merge ${b}`),
                              disabled: !current,
                            },
                            { id: 'delete', label: 'Delete branch', icon: 'delete', danger: true, onSelect: () => run(`git branch -d ${b}`) },
                          ]}
                        />
                      </>
                    )}
                  </li>
                )
              })}
              {branches.length === 0 && <li className="text-xs text-on-surface-variant">No branches until the first commit.</li>}
            </ul>
          </div>

          <div className="rounded-lg border border-outline bg-background p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Stash</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outlined"
                icon="inventory_2"
                onClick={() => run('git stash')}
                disabled={busy || (staged.length === 0 && (st?.unstaged.length ?? 0) === 0)}
              >
                Stash changes
              </Button>
              <Button size="sm" variant="outlined" icon="unarchive" onClick={() => run('git stash pop')} disabled={busy || !stashes}>
                Pop stash
              </Button>
              <Button size="sm" variant="text" onClick={() => run('git stash list')} disabled={busy || !stashes}>
                List
              </Button>
            </div>
          </div>

          {inOperation && (
            <InlineMessage
              tone="warning"
              title={`${graph?.state.rebasing ? 'Rebase' : graph?.state.merging ? 'Merge' : graph?.state.cherryPicking ? 'Cherry-pick' : 'Revert'} in progress`}
            >
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() =>
                    run(
                      `git ${graph?.state.rebasing ? 'rebase' : graph?.state.merging ? 'merge' : graph?.state.cherryPicking ? 'cherry-pick' : 'revert'} --abort`,
                    )
                  }
                  disabled={busy}
                >
                  Abort
                </Button>
                {!graph?.state.merging && (
                  <Button
                    size="sm"
                    onClick={() => run(`git ${graph?.state.rebasing ? 'rebase' : graph?.state.cherryPicking ? 'cherry-pick' : 'revert'} --continue`)}
                    disabled={busy || (graph?.state.conflicts.length ?? 0) > 0}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </InlineMessage>
          )}
          <div className="rounded-lg border border-outline bg-background p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Inspect</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="text" icon="list" onClick={() => run('git status')} disabled={busy}>
                Status
              </Button>
              <Button size="sm" variant="text" icon="history" onClick={() => run('git log --oneline --graph --all')} disabled={busy}>
                Log
              </Button>
              <Button size="sm" variant="text" icon="difference" onClick={() => run('git diff')} disabled={busy}>
                Diff
              </Button>
            </div>
          </div>
        </section>
      </div>
      {last && <LastCommand last={last} />}
    </div>
  )
}

interface FileItem {
  path: string
  code: string
  tone: 'success' | 'warning' | 'error'
}

function FileGroup({
  title,
  empty,
  items,
  actions,
  onOpen,
}: {
  title: string
  empty: string
  items: FileItem[]
  actions: (path: string, code: string) => React.ReactNode
  onOpen: (path: string) => void
}) {
  return (
    <div className="mb-2">
      <h4 className="px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
        {title} <span className="font-normal">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="px-1 py-1 text-xs text-on-surface-variant">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it) => (
            <li key={it.path} className="group flex h-8 items-center gap-2 rounded-md px-1 hover:bg-surface-variant">
              <span
                className={cn(
                  'w-5 shrink-0 font-mono text-[11px] font-medium',
                  it.tone === 'success' ? 'text-success' : it.tone === 'error' ? 'text-error' : 'text-[#b06000]',
                )}
              >
                {it.code}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline"
                onClick={() => onOpen(it.path)}
                title={`Open ${it.path}`}
              >
                {it.path}
              </button>
              <span className="flex shrink-0 items-center gap-1">{actions(it.path, it.code)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function quotePath(p: string): string {
  return /[\s"'$`\\]/.test(p) ? quote(p) : p
}

function PanelHeader() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-outline bg-background px-3 text-xs text-on-surface-variant">
      <span className="inline-flex items-center gap-1.5">
        <Icon name="dashboard_customize" size={16} /> Git actions
      </span>
      <span>Each action runs the real command and shows it below</span>
    </div>
  )
}

function LastCommand({ last }: { last: { command: string; output: string; ok: boolean } }) {
  return (
    <div className={cn('shrink-0 border-t px-3 py-2', last.ok ? 'border-outline bg-background' : 'border-error/40 bg-error-container/40')} aria-live="polite">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-on-surface-variant">Equivalent command</span>
        <code className="rounded-sm bg-surface-variant px-1.5 py-0.5 font-mono text-on-surface">{last.command}</code>
        {!last.ok && <span className="text-error">failed</span>}
      </div>
      {last.output && (
        <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-4 text-on-surface-variant">{last.output}</pre>
      )}
    </div>
  )
}
