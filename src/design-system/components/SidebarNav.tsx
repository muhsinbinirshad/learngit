import { NavLink } from 'react-router-dom'
import { cn } from '../cn'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'

export interface SidebarItem {
  to: string
  label: string
  icon: string
  /** Match nested routes too (default: exact for '/'). */
  end?: boolean
  hint?: string
}

interface SidebarNavProps {
  items: SidebarItem[]
  collapsed: boolean
  onToggle: () => void
  footer?: React.ReactNode
}

/** Left navigation rail. Collapses to icons; labels remain available as tooltips. */
export function SidebarNav({ items, collapsed, onToggle, footer }: SidebarNavProps) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-outline bg-background transition-[width] duration-base ease-standard',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => {
          const link = (
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-standard hover:no-underline focus-visible:outline-none',
                  isActive
                    ? 'bg-primary-container font-medium text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={20} filled={isActive} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.hint && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">{item.hint}</span>
                  )}
                </>
              )}
            </NavLink>
          )
          return (
            <li key={item.to}>
              {collapsed ? (
                <Tooltip content={item.label} side="bottom">
                  <span className="block">{link}</span>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          )
        })}
      </ul>
      {footer && !collapsed && <div className="border-t border-outline-variant p-3">{footer}</div>}
      <div className="border-t border-outline-variant p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-on-surface-variant transition-standard hover:bg-surface-variant hover:text-on-surface"
        >
          <Icon name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} size={20} />
          {!collapsed && <span>Collapse</span>}
          <span className="sr-only">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
        </button>
      </div>
    </nav>
  )
}
