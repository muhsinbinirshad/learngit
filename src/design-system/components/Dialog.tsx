import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../cn'
import { IconButton } from './IconButton'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Prevent closing via Escape/backdrop (for confirmations that need an explicit choice). */
  strict?: boolean
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }

/** Modal dialog on the native <dialog> element: focus trap, Escape and backdrop close, scroll lock. */
export function Dialog({ open, onClose, title, description, children, actions, size = 'md', strict }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      if (!strict) onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose, strict])
  return (
    // Backdrop click is a pointer-only convenience; keyboard users close with Escape via the native cancel event.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'm-auto w-[calc(100%-32px)] rounded-lg border border-outline bg-background p-0 text-on-surface shadow-2 backdrop:bg-[rgba(32,33,36,0.5)] open:animate-rise-in',
        sizes[size],
      )}
      onClick={(e) => {
        if (!strict && e.target === ref.current) onClose()
      }}
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id={titleId} className="text-lg font-medium">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-on-surface-variant">
                {description}
              </p>
            )}
          </div>
          {!strict && <IconButton icon="close" label="Close dialog" onClick={onClose} />}
        </header>
        {children && <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>}
        {actions && <footer className="flex justify-end gap-2 border-t border-outline-variant px-6 py-3">{actions}</footer>}
      </div>
    </dialog>
  )
}
