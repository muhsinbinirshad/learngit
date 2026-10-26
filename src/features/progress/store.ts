import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LabStatus = 'not-started' | 'in-progress' | 'completed'

export interface LabProgress {
  status: LabStatus
  objectives: Record<string, boolean>
  hintsUsed: Record<string, number> // objectiveId -> highest hint level revealed (1-3)
  commandsRun: number
  startedAt: number | null
  completedAt: number | null
  /** Seconds actively spent (accumulated while the lab page is open). */
  elapsedSeconds: number
  resets: number
  /** Whether the debrief was viewed after completion. */
  debriefSeen: boolean
  mode: 'terminal' | 'ui'
}

export interface LessonProgress {
  status: 'completed'
  completedAt: number
}

interface ProgressState {
  labs: Record<string, LabProgress>
  lessons: Record<string, LessonProgress>
  lastLabId: string | null
  completeLesson: (lessonId: string) => void
  start: (labId: string) => void
  update: (labId: string, patch: Partial<LabProgress>) => void
  setObjectives: (labId: string, objectives: Record<string, boolean>, total: number) => void
  revealHint: (labId: string, objectiveId: string, level: number) => void
  recordCommand: (labId: string) => void
  addTime: (labId: string, seconds: number) => void
  reset: (labId: string) => void
}

export const emptyProgress = (): LabProgress => ({
  status: 'not-started',
  objectives: {},
  hintsUsed: {},
  commandsRun: 0,
  startedAt: null,
  completedAt: null,
  elapsedSeconds: 0,
  resets: 0,
  debriefSeen: false,
  mode: 'terminal',
})

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      labs: {},
      lessons: {},
      lastLabId: null,
      completeLesson: (lessonId) =>
        set((s) => ({ lessons: { ...s.lessons, [lessonId]: { status: 'completed', completedAt: s.lessons[lessonId]?.completedAt ?? Date.now() } } })),
      start: (labId) =>
        set((s) => {
          const cur = s.labs[labId] ?? emptyProgress()
          return {
            lastLabId: labId,
            labs: { ...s.labs, [labId]: { ...cur, status: cur.status === 'completed' ? 'completed' : 'in-progress', startedAt: cur.startedAt ?? Date.now() } },
          }
        }),
      update: (labId, patch) => set((s) => ({ labs: { ...s.labs, [labId]: { ...(s.labs[labId] ?? emptyProgress()), ...patch } } })),
      setObjectives: (labId, objectives, total) =>
        set((s) => {
          const cur = s.labs[labId] ?? emptyProgress()
          const metCount = Object.values(objectives).filter(Boolean).length
          const completed = total > 0 && metCount === total
          return {
            labs: {
              ...s.labs,
              [labId]: {
                ...cur,
                objectives,
                status: completed ? 'completed' : cur.status === 'completed' ? 'completed' : 'in-progress',
                completedAt: completed ? (cur.completedAt ?? Date.now()) : cur.completedAt,
              },
            },
          }
        }),
      revealHint: (labId, objectiveId, level) =>
        set((s) => {
          const cur = s.labs[labId] ?? emptyProgress()
          const prev = cur.hintsUsed[objectiveId] ?? 0
          if (level <= prev) return {}
          return { labs: { ...s.labs, [labId]: { ...cur, hintsUsed: { ...cur.hintsUsed, [objectiveId]: level } } } }
        }),
      recordCommand: (labId) =>
        set((s) => {
          const cur = s.labs[labId] ?? emptyProgress()
          return { labs: { ...s.labs, [labId]: { ...cur, commandsRun: cur.commandsRun + 1 } } }
        }),
      addTime: (labId, seconds) =>
        set((s) => {
          const cur = s.labs[labId]
          if (!cur) return {}
          return { labs: { ...s.labs, [labId]: { ...cur, elapsedSeconds: cur.elapsedSeconds + seconds } } }
        }),
      reset: (labId) =>
        set((s) => {
          const cur = s.labs[labId] ?? emptyProgress()
          return { labs: { ...s.labs, [labId]: { ...emptyProgress(), resets: cur.resets + 1, mode: cur.mode, startedAt: Date.now(), status: 'in-progress' } } }
        }),
      ...({} as Pick<ProgressState, never>),
      get,
    }),
    { name: 'commitlab.progress', version: 2, migrate: (state) => ({ lessons: {}, ...(state as object) }) },
  ),
)

export function labProgress(labId: string): LabProgress {
  return useProgress.getState().labs[labId] ?? emptyProgress()
}
