import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactElement<Record<string, unknown>>
  side?: 'top' | 'bottom'
}

/** Hover/focus tooltip. The trigger keeps its own aria-label; the tooltip is supplementary. */
export function Tooltip({ content, children, side = 'bottom' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const child = children as ReactElement<Record<string, unknown>>
  const props = child.props
  const trigger = cloneElement(child, {
    'aria-describedby': open ? id : undefined,
    onMouseEnter: (e: unknown) => {
      setOpen(true)
      ;(props.onMouseEnter as ((e: unknown) => void) | undefined)?.(e)
    },
    onMouseLeave: (e: unknown) => {
      setOpen(false)
      ;(props.onMouseLeave as ((e: unknown) => void) | undefined)?.(e)
    },
    onFocus: (e: unknown) => {
      setOpen(true)
      ;(props.onFocus as ((e: unknown) => void) | undefined)?.(e)
    },
    onBlur: (e: unknown) => {
      setOpen(false)
      ;(props.onBlur as ((e: unknown) => void) | undefined)?.(e)
    },
  })
  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-sm bg-on-surface px-2 py-1 text-xs text-background shadow-1 animate-fade-in ${side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
