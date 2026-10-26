import { useEffect, useState } from 'react'
import type { GraphNode } from '@/engine/git/graph'
import { Repo } from '@/engine/git/repo'
import { diffCommits, type FileDiff } from '@/engine/git/diff'
import type { LabSession } from '../session/LabSession'
import { gitDate } from '@/engine/shell/format'
import { Icon, IconButton, Skeleton, toast } from '@/design-system/components'
import { cn } from '@/design-system/cn'
import { DiffView } from './DiffView'

export function CommitDetails({ node, session, onClose }: { node: GraphNode; session: LabSession; onClose: () => void }) {
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const repo = new Repo(session.fs, session.repoDir)
    if (node.parents.length > 1) return
    diffCommits(repo, node.parents[0] ?? null, node.oid).then((d) => {
      if (!cancelled) setDiffs(d)
    })
    return () => {
      cancelled = true
    }
  }, [node, session])

  const [subject, ...body] = node.message.replace(/\n+$/, '').split('\n')
  return (
    <div className="flex min-h-0 flex-col border-t border-outline bg-background" aria-label="Commit details">
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5">{subject}</p>
          {body.filter(Boolean).length > 0 && (
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-5 text-on-surface-variant">{body.join('\n').trim()}</pre>
          )}
        </div>
        <IconButton icon="close" label="Close commit details" size="sm" onClick={onClose} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <dt className="text-on-surface-variant">Commit</dt>
        <dd className="flex items-center gap-1 font-mono">
          <span className="truncate">{node.oid}</span>
          <IconButton
            icon="content_copy"
            label="Copy full hash"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(node.oid)
              toast({ tone: 'info', title: 'Hash copied' }, 2000)
            }}
          />
        </dd>
        <dt className="text-on-surface-variant">Author</dt>
        <dd className="truncate">
          {node.author.name} <span className="text-on-surface-variant">&lt;{node.author.email}&gt;</span>
        </dd>
        <dt className="text-on-surface-variant">Date</dt>
        <dd>{gitDate(node.author.timestamp)}</dd>
        <dt className="text-on-surface-variant">Parents</dt>
        <dd className="font-mono">
          {node.parents.length ? (
            node.parents.map((p) => p.slice(0, 7)).join(', ')
          ) : (
            <span className="font-sans text-on-surface-variant">none (root commit)</span>
          )}
        </dd>
      </dl>
      <div className="min-h-0 flex-1 overflow-auto border-t border-outline-variant">
        {node.parents.length > 1 ? (
          <p className="p-3 text-xs text-on-surface-variant">Merge commit. Select either parent to inspect what each side contributed.</p>
        ) : diffs === null ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : diffs.length === 0 ? (
          <p className="p-3 text-xs text-on-surface-variant">No file changes.</p>
        ) : (
          <ul className="py-1">
            {diffs.map((d) => (
              <li key={d.path}>
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-2 px-3 text-left text-xs hover:bg-surface-variant"
                  aria-expanded={openFile === d.path}
                  onClick={() => setOpenFile((o) => (o === d.path ? null : d.path))}
                >
                  <Icon name={openFile === d.path ? 'expand_more' : 'chevron_right'} size={16} className="text-on-surface-variant" />
                  <span
                    className={cn('w-3 font-mono font-medium', d.status === 'added' ? 'text-success' : d.status === 'deleted' ? 'text-error' : 'text-warning')}
                  >
                    {d.status === 'added' ? 'A' : d.status === 'deleted' ? 'D' : 'M'}
                  </span>
                  <span className="truncate font-mono">{d.path}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px]">
                    <span className="text-success">+{d.insertions}</span> <span className="text-error">−{d.deletions}</span>
                  </span>
                </button>
                {openFile === d.path && <DiffView diff={d} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
