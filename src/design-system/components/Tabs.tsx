import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

export interface TabItem {
  id: string
  label: ReactNode
  icon?: string
  /** Trailing control (e.g. close button). */
  trailing?: ReactNode
  dirty?: boolean
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}

/** Accessible tab list with roving focus (arrow keys, Home/End). Panels are rendered by the caller. */
export function Tabs({ items, value, onChange, ariaLabel, size = 'md', className }: TabsProps) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex((i) => i.id === value)
    let next: number
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else return
    e.preventDefault()
    const target = items[next]
    if (target) {
      onChange(target.id)
      const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`)
      el?.focus()
    }
  }
  return (
    <div
      ref={listRef}
      role="tablist"
      tabIndex={-1}
      aria-label={ariaLabel}
      className={cn('flex items-end gap-1 border-b border-outline', className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value
        return (
          <div key={item.id} className="group relative flex items-center">
            <button
              type="button"
              role="tab"
              id={`${id}-${item.id}`}
              data-tab-id={item.id}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-t-md border-b-2 font-medium transition-standard focus-visible:z-10',
                size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
                selected ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
                item.trailing && 'pr-7',
              )}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              <span className={cn(item.dirty && 'italic')}>{item.label}</span>
              {item.dirty && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-label="unsaved changes" />}
            </button>
            {item.trailing && <span className="absolute right-1 top-1/2 -translate-y-1/2">{item.trailing}</span>}
          </div>
        )
      })}
    </div>
  )
}
