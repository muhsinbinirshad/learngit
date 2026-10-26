import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './Icon'

export interface MenuItem {
  id: string
  label: ReactNode
  icon?: string
  description?: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

interface MenuProps {
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  label: string
}

/** Dropdown menu with keyboard navigation, outside-click and Escape handling. */
export function Menu({ trigger, items, align = 'left', label }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    requestAnimationFrame(() => listRef.current?.focus())
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, items])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      let next = active
      for (let k = 0; k < items.length; k++) {
        next = (next + dir + items.length) % items.length
        if (!items[next]?.disabled) break
      }
      setActive(next)
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const item = items[active]
      if (item && !item.disabled) {
        item.onSelect()
        setOpen(false)
      }
    }
  }

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({
        onClick: () => {
          const first = items.findIndex((i) => !i.disabled)
          setActive(first < 0 ? 0 : first)
          setOpen((o) => !o)
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
      })}
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn(
            'absolute top-full z-40 mt-1 min-w-56 rounded-md border border-outline bg-background py-1 shadow-2 animate-fade-in focus:outline-none',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              aria-disabled={item.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                if (item.disabled) return
                item.onSelect()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-standard disabled:cursor-not-allowed disabled:opacity-50',
                i === active && !item.disabled && 'bg-surface-variant',
                item.danger ? 'text-error' : 'text-on-surface',
              )}
            >
              {item.icon && <Icon name={item.icon} size={18} className="mt-0.5" />}
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.description && <span className="block text-xs text-on-surface-variant">{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
