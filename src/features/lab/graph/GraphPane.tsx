import { useMemo, useState } from 'react'
import type { LabSession, SessionState } from '../session/LabSession'
import { EmptyState, Icon, InlineMessage } from '@/design-system/components'
import { CommitGraph } from './CommitGraph'
import { CommitDetails } from './CommitDetails'
import { ThreeTrees } from './ThreeTrees'

export function GraphPane({ session, state, onOpenFile }: { session: LabSession; state: SessionState; onOpenFile: (path: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const model = state.repo.graph
  const node = useMemo(() => model?.nodes.find((n) => n.oid === selected) ?? null, [model, selected])

  const st = model?.state
  const banner = st?.conflicts.length
    ? {
        tone: 'error' as const,
        text: `${st.rebasing ? 'Rebase' : st.cherryPicking ? 'Cherry-pick' : st.reverting ? 'Revert' : 'Merge'} paused: ${st.conflicts.length} conflicted file${st.conflicts.length === 1 ? '' : 's'} to resolve, then \`git add\` them.`,
      }
    : st?.merging
      ? { tone: 'warning' as const, text: 'Merge in progress. Conflicts resolved; run `git commit` to finish or `git merge --abort` to back out.' }
      : st?.rebasing
        ? { tone: 'warning' as const, text: 'Rebase in progress. Continue with `git rebase --continue`, or `git rebase --abort`.' }
        : st?.cherryPicking || st?.reverting
          ? { tone: 'warning' as const, text: `${st.cherryPicking ? 'Cherry-pick' : 'Revert'} in progress. Continue with --continue or back out with --abort.` }
          : st?.bisecting
            ? { tone: 'info' as const, text: 'Bisecting. Mark the checked-out commit with `git bisect good` or `git bisect bad`.' }
            : model?.head.detached
              ? {
                  tone: 'info' as const,
                  text: 'HEAD is detached: you are on a commit, not a branch. New commits here are not on any branch until you create one.',
                }
              : null

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-outline px-3 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="account_tree" size={16} /> Repository
        </span>
        {model && (
          <span>
            {model.nodes.length} commit{model.nodes.length === 1 ? '' : 's'} · {model.refs.filter((r) => r.kind === 'branch').length} branch
            {model.refs.filter((r) => r.kind === 'branch').length === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      {state.repo.exists && <ThreeTrees repo={state.repo} onOpenFile={onOpenFile} repoDir={session.repoDir} />}
      {banner && (
        <InlineMessage tone={banner.tone} className="m-2">
          <span className="text-xs">{banner.text}</span>
        </InlineMessage>
      )}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {!state.repo.exists ? (
          <EmptyState
            compact
            icon="account_tree"
            title="No repository yet"
            description="The graph appears once there is a .git directory. Run `git init` to create one."
          />
        ) : !model || model.nodes.length === 0 ? (
          <EmptyState compact icon="commit" title="No commits yet" description="Stage files with `git add`, then `git commit` to create the first node." />
        ) : (
          <CommitGraph model={model} selected={selected} onSelect={setSelected} />
        )}
      </div>
      {node && (
        <div className="max-h-[45%] min-h-0 flex-shrink-0 overflow-hidden">
          <CommitDetails key={node.oid} node={node} session={session} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  )
}
