export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-outline bg-surface px-1 font-mono text-[11px] text-on-surface-variant">
      {children}
    </kbd>
  )
}
