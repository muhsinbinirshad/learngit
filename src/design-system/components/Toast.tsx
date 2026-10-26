import { create } from 'zustand'
import { cn } from '../cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

export interface ToastItem {
  id: number
  tone: 'info' | 'success' | 'error'
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>, ttlMs?: number) => void
  dismiss: (id: number) => void
}

let counter = 0
export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (t, ttlMs = 6000) => {
    const id = ++counter
    set((s) => ({ items: [...s.items.slice(-2), { ...t, id }] }))
    if (ttlMs > 0) setTimeout(() => get().dismiss(id), ttlMs)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export function toast(t: Omit<ToastItem, 'id'>, ttlMs?: number) {
  useToasts.getState().push(t, ttlMs)
}

const icons = { info: 'info', success: 'check_circle', error: 'error' }

/** Material name for the same component. */
export const snackbar = toast

export function ToastViewport() {
  const { items, dismiss } = useToasts()
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(420px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-md bg-on-surface px-4 py-3 text-sm text-background shadow-2 animate-rise-in"
        >
          <Icon name={icons[t.tone]} size={18} className={cn('mt-0.5', t.tone === 'success' && 'text-[#81c995]', t.tone === 'error' && 'text-[#f28b82]')} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs text-background/80">{t.description}</p>}
          </div>
          {t.action && (
            <button
              type="button"
              className="shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-[#8ab4f8] hover:bg-background/10"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <IconButton
            icon="close"
            label="Dismiss"
            size="sm"
            className="text-background/70 hover:bg-background/10 hover:text-background"
            onClick={() => dismiss(t.id)}
          />
        </div>
      ))}
    </div>
  )
}

export const Snackbar = ToastViewport
