import { useEffect, useRef, useState } from 'react'
import { createBrowserFs } from '@/engine/fs/browser'
import type { LabDefinition } from '@/engine/scenario/types'
import { useProgress } from '@/features/progress/store'
import { LabSession, type SessionState } from './LabSession'

export function fsNameFor(labId: string): string {
  return `commitlab-${labId}`
}

/**
 * Create (or resume) the session for a lab and subscribe React to its state.
 * Survives StrictMode's double mount: the session object lives in a ref and the second effect run
 * simply re-subscribes to the in-flight initialisation.
 */
export function useLabSession(lab: LabDefinition): { session: LabSession | null; state: SessionState | null; fatal: string | null } {
  const [session, setSession] = useState<LabSession | null>(null)
  const [state, setState] = useState<SessionState | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const sessionRef = useRef<LabSession | null>(null)

  useEffect(() => {
    let active = true
    let s = sessionRef.current
    if (!s || s.lab.id !== lab.id) {
      const progress = useProgress.getState()
      const existing = progress.labs[lab.id]
      const resume = !!existing && existing.status !== 'not-started'
      const fs = createBrowserFs(fsNameFor(lab.id), false)
      s = new LabSession(lab, fs, existing?.objectives ?? {})
      sessionRef.current = s
      progress.start(lab.id)
      s.init(resume).catch((e: unknown) => {
        if (sessionRef.current === s) setFatal(e instanceof Error ? e.message : String(e))
      })
    }
    const current = s
    const publish = (st: SessionState) => {
      if (!active) return
      setSession(current)
      setState(st)
    }
    const unsub = current.subscribe(publish)
    if (current.state.ready) publish(current.state)
    return () => {
      active = false
      unsub()
    }
  }, [lab])

  // Persist objective progress whenever it changes.
  useEffect(() => {
    if (!state?.ready) return
    useProgress.getState().setObjectives(lab.id, state.objectives, lab.objectives.length)
  }, [state?.objectives, state?.ready, lab])

  return { session: session && session.lab.id === lab.id && state?.ready ? session : null, state: state?.ready ? state : null, fatal }
}
