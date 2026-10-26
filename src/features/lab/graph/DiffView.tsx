import type { FileDiff } from '@/engine/git/diff'
import { cn } from '@/design-system/cn'

/** Compact unified diff renderer for the details panel. */
export function DiffView({ diff }: { diff: FileDiff }) {
  return (
    <div className="mx-3 mb-2 overflow-x-auto rounded-md border border-outline bg-surface font-mono text-[11px] leading-5">
      {diff.hunks.map((h, i) => (
        <div key={i}>
          <div className="bg-surface-variant px-2 text-on-surface-variant">
            @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
          </div>
          {h.lines.map((l, j) => (
            <div
              key={j}
              className={cn(
                'whitespace-pre px-2',
                l.startsWith('+') && 'bg-success-container text-on-success-container',
                l.startsWith('-') && 'bg-error-container text-on-error-container',
                l.startsWith('\\') && 'text-on-surface-variant',
              )}
            >
              {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
