import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Preferences {
  reduceMotion: boolean
  terminalFontSize: number
  setReduceMotion: (v: boolean) => void
  setTerminalFontSize: (n: number) => void
}

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      terminalFontSize: 13,
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize }),
    }),
    { name: 'commitlab.preferences' },
  ),
)

/** Apply the reduce-motion preference as a root attribute consumed by tokens.css. */
export function applyMotionPreference(reduce: boolean): void {
  document.documentElement.toggleAttribute('data-reduce-motion', reduce)
}
