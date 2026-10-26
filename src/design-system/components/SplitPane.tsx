import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../cn'

interface SplitPaneProps {
  direction: 'horizontal' | 'vertical'
  /** Sizes as fractions summing to 1. */
  initial: number[]
  minPx?: number
  children: ReactNode[]
  /** Collapsed pane indexes render at 0 width. */
  collapsed?: boolean[]
  className?: string
  labels: string[]
  storageKey?: string
}

/** Resizable panes with pointer drag and keyboard (arrow keys) on each separator. */
export function SplitPane({ direction, initial, minPx = 200, children, collapsed = [], className, labels, storageKey }: SplitPaneProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState<number[]>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`commitlab.split.${storageKey}`)
        if (saved) {
          const parsed = JSON.parse(saved) as number[]
          if (parsed.length === initial.length) return parsed
        }
      } catch {
        /* ignore */
      }
    }
    return initial
  })
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(`commitlab.split.${storageKey}`, JSON.stringify(sizes))
    } catch {
      /* ignore */
    }
  }, [sizes, storageKey])

  const horizontal = direction === 'horizontal'

  const resize = useCallback(
    (index: number, deltaPx: number) => {
      const el = ref.current
      if (!el) return
      const total = horizontal ? el.clientWidth : el.clientHeight
      setSizes((prev) => {
        const next = [...prev]
        const a = index
        const b = index + 1
        const delta = deltaPx / total
        const minFrac = minPx / total
        const newA = Math.max(minFrac, prev[a]! + delta)
        const newB = Math.max(minFrac, prev[b]! - delta)
        if (newA + newB > prev[a]! + prev[b]! + 1e-6) return prev
        next[a] = newA
        next[b] = prev[a]! + prev[b]! - newA
        return next
      })
    },
    [horizontal, minPx],
  )

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const start = horizontal ? e.clientX : e.clientY
    let last = start
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const pos = horizontal ? ev.clientX : ev.clientY
      resize(index, pos - last)
      last = pos
    }
    const up = () => {
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const visibleIdx = children.map((_, i) => i).filter((i) => !collapsed[i])
  const visibleTotal = visibleIdx.reduce((s, i) => s + sizes[i]!, 0)

  return (
    <div ref={ref} className={cn('flex min-h-0 min-w-0 flex-1', horizontal ? 'flex-row' : 'flex-col', className)}>
      {children.map((child, i) => {
        const isCollapsed = !!collapsed[i]
        const frac = isCollapsed ? 0 : sizes[i]! / visibleTotal
        const nextVisible = visibleIdx.find((v) => v > i)
        const showHandle = !isCollapsed && nextVisible !== undefined
        return (
          <div key={i} className="contents">
            <section
              aria-label={labels[i]}
              className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden', isCollapsed && 'hidden')}
              style={{ flexBasis: `${frac * 100}%`, flexGrow: 0, flexShrink: 0 }}
            >
              {child}
            </section>
            {showHandle && (
              // A focusable separator is the WAI-ARIA window-splitter pattern (arrow keys resize it).
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <div
                role="separator"
                aria-label={`Resize ${labels[i]} and ${labels[nextVisible]}`}
                aria-orientation={horizontal ? 'vertical' : 'horizontal'}
                aria-valuenow={Math.round(frac * 100)}
                tabIndex={0}
                onPointerDown={startDrag(i)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 48 : 16
                  if ((horizontal && e.key === 'ArrowLeft') || (!horizontal && e.key === 'ArrowUp')) {
                    e.preventDefault()
                    resize(i, -step)
                  }
                  if ((horizontal && e.key === 'ArrowRight') || (!horizontal && e.key === 'ArrowDown')) {
                    e.preventDefault()
                    resize(i, step)
                  }
                }}
                className={cn(
                  'group relative z-10 shrink-0 bg-outline transition-standard hover:bg-primary focus-visible:bg-primary',
                  horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
                )}
              >
                <span className={cn('absolute', horizontal ? '-left-1 -right-1 top-0 bottom-0' : '-top-1 -bottom-1 left-0 right-0')} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
