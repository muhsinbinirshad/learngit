import { useState } from 'react'
import type { RepoModel } from '../session/LabSession'
import { Icon } from '@/design-system/components'
import { cn } from '@/design-system/cn'

/** Working tree → Staging area → Repository strip with live counts. */
export function ThreeTrees({ repo, onOpenFile, repoDir }: { repo: RepoModel; onOpenFile: (path: string) => void; repoDir: string }) {
  const [open, setOpen] = useState<'worktree' | 'index' | null>(null)
  const st = repo.status
  const unstaged = st ? st.unstaged.length + st.untracked.length + st.conflicted.length : 0
  const staged = st?.staged.length ?? 0
  const head = repo.graph?.head
  const headLabel = head?.branch ? head.branch : head?.oid ? `detached ${head.oid.slice(0, 7)}` : 'no commits'

  const toggle = (k: 'worktree' | 'index') => setOpen((o) => (o === k ? null : k))

  return (
    <div className="border-b border-outline bg-surface px-3 py-2" aria-label="The three trees">
      <div className="grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] items-stretch gap-1">
        <TreeCard
          title="Working tree"
          value={unstaged}
          unit="change"
          active={open === 'worktree'}
          onClick={() => toggle('worktree')}
          tone={st?.conflicted.length ? 'error' : unstaged ? 'warning' : 'neutral'}
        />
        <Arrow label="git add" />
        <TreeCard
          title="Staging area"
          value={staged}
          unit="staged"
          active={open === 'index'}
          onClick={() => toggle('index')}
          tone={staged ? 'primary' : 'neutral'}
        />
        <Arrow label="git commit" />
        <div className="flex flex-col justify-center rounded-md border border-outline bg-background px-2 py-1.5">
          <span className="whitespace-nowrap text-[11px] text-on-surface-variant">HEAD</span>
          <span className="truncate font-mono text-xs font-medium" title={headLabel}>
            {headLabel}
          </span>
          {head?.oid && <span className="font-mono text-[11px] text-on-surface-variant">{head.oid.slice(0, 7)}</span>}
        </div>
      </div>
      {open && st && (
        <ul className="mt-2 max-h-28 overflow-auto rounded-md border border-outline bg-background py-1 text-xs">
          {(open === 'worktree' ? [...st.conflicted, ...st.unstaged, ...st.untracked] : st.staged).map((e) => (
            <li key={e.path}>
              <button
                type="button"
                className="flex h-6 w-full items-center gap-2 px-2 text-left hover:bg-surface-variant"
                onClick={() => onOpenFile(`${repoDir}/${e.path}`)}
              >
                <span
                  className={cn(
                    'w-4 font-mono font-medium',
                    e.conflicted
                      ? 'text-error'
                      : e.untracked
                        ? 'text-success'
                        : (open === 'worktree' ? e.unstaged : e.staged) === 'deleted'
                          ? 'text-error'
                          : (open === 'worktree' ? e.unstaged : e.staged) === 'added'
                            ? 'text-success'
                            : 'text-warning',
                  )}
                >
                  {e.conflicted
                    ? 'UU'
                    : e.untracked
                      ? '??'
                      : (open === 'worktree' ? e.unstaged : e.staged) === 'deleted'
                        ? 'D'
                        : (open === 'worktree' ? e.unstaged : e.staged) === 'added'
                          ? 'A'
                          : 'M'}
                </span>
                <span className="truncate font-mono">{e.path}</span>
              </button>
            </li>
          ))}
          {(open === 'worktree' ? unstaged : staged) === 0 && <li className="px-2 py-1 text-on-surface-variant">Nothing here.</li>}
        </ul>
      )}
    </div>
  )
}

function TreeCard({
  title,
  value,
  unit,
  active,
  onClick,
  tone,
}: {
  title: string
  value: number
  unit: string
  active: boolean
  onClick: () => void
  tone: 'neutral' | 'primary' | 'warning' | 'error'
}) {
  const toneCls = { neutral: 'text-on-surface-variant', primary: 'text-primary', warning: 'text-[#b06000]', error: 'text-error' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        'flex flex-col rounded-md border bg-background px-2 py-1.5 text-left transition-standard hover:border-primary',
        active ? 'border-primary' : 'border-outline',
      )}
    >
      <span className="whitespace-nowrap text-[11px] text-on-surface-variant">{title}</span>
      <span className={cn('whitespace-nowrap text-xs font-medium', toneCls)}>
        {value} {unit}
        {value === 1 ? '' : unit === 'staged' ? '' : 's'}
      </span>
    </button>
  )
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-0.5 text-on-surface-variant" aria-hidden>
      <Icon name="arrow_forward" size={16} />
      <span className="font-mono text-[9px] leading-3">{label}</span>
    </div>
  )
}
