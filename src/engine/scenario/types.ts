/**
 * Lab definition types. Labs are pure data (see lab.schema.json); this file is the TypeScript
 * mirror of that schema plus the declarative check language used by the validator.
 */

export type Check =
  | { type: 'branchExists'; name: string }
  | { type: 'branchNotExists'; name: string }
  | { type: 'headOnBranch'; name: string }
  | { type: 'headDetached' }
  | { type: 'headEquals'; ref: string }
  | { type: 'commitCount'; ref?: string; exclude?: string; min?: number; max?: number; exact?: number }
  | { type: 'commitMessageMatches'; ref?: string; exclude?: string; pattern: string; flags?: string; which?: 'head' | 'any' | 'all' }
  | {
      type: 'commitMessageFormat'
      ref?: string
      exclude?: string
      maxSubject?: number
      noTrailingPeriod?: boolean
      requireBlankLine?: boolean
      which?: 'head' | 'all'
    }
  | { type: 'commitAuthor'; ref?: string; pattern: string }
  | { type: 'commitTouchesOnly'; ref?: string; paths: string[] }
  | { type: 'commitChangesPath'; ref?: string; path: string }
  | { type: 'headIsMergeCommit'; ref?: string }
  | { type: 'mergeCommitWithParent'; ref?: string; parent: string; position?: 'any' | 'first' | 'nonFirst' }
  | { type: 'linearHistory'; ref?: string; upstream?: string }
  | { type: 'refContains'; ref: string; target: string }
  | { type: 'refsEqual'; a: string; b: string }
  | { type: 'tagExists'; name: string; ref?: string; annotated?: boolean }
  | { type: 'fileExists'; path: string; ref?: string }
  | { type: 'fileNotExists'; path: string; ref?: string }
  | { type: 'fileContains'; path: string; pattern: string; flags?: string; ref?: string }
  | { type: 'fileNotContains'; path: string; pattern: string; flags?: string; ref?: string }
  | { type: 'fileTracked'; path: string; ref?: string }
  | { type: 'fileNotTracked'; path: string; ref?: string }
  | { type: 'fileStaged'; path: string }
  | { type: 'fileHasUnstagedChanges'; path: string }
  | { type: 'fileIgnored'; path: string }
  | { type: 'workingTreeClean' }
  | { type: 'noStagedChanges' }
  | { type: 'noConflictMarkers'; path: string }
  | { type: 'noConflicts' }
  | { type: 'noOperationInProgress' }
  | { type: 'stashCount'; min?: number; max?: number }
  | { type: 'configSet'; key: string; pattern?: string; scope?: 'any' | 'global' | 'local' }
  | { type: 'reflogContains'; pattern: string }
  | { type: 'remoteBranchEquals'; remote: string; branch: string; ref: string }
  | { type: 'remoteBranchExists'; remote: string; branch: string }
  | { type: 'not'; check: Check }
  | { type: 'all'; checks: Check[] }
  | { type: 'any'; checks: Check[] }

export interface Objective {
  id: string
  title: string
  /** Short clarification shown under the title. */
  description?: string
  check: Check
  /** Progressive hints: nudge, concept, exact command (1-3 entries). */
  hints: string[]
  /** Once met, stays met even if later state changes (default true). */
  sticky?: boolean
}

export interface Persona {
  name: string
  email: string
  role?: string
}

export type SeedStep =
  | { type: 'file'; path: string; content: string }
  | { type: 'delete'; path: string }
  | { type: 'commit'; message: string; author?: string; files?: Record<string, string>; delete?: string[]; label?: string; allowEmpty?: boolean }
  | { type: 'branch'; name: string; from?: string }
  | { type: 'checkout'; ref: string; create?: boolean; detach?: boolean }
  | { type: 'merge'; ref: string; message?: string }
  | { type: 'tag'; name: string; ref?: string; message?: string }
  | { type: 'stage'; paths: string[] }
  | { type: 'stash'; message?: string }
  | { type: 'config'; key: string; value: string; global?: boolean }
  | { type: 'remote'; name: string; path: string }
  | { type: 'push'; remote?: string; branch?: string; setUpstream?: boolean }
  | { type: 'reset'; mode: 'soft' | 'mixed' | 'hard'; ref: string }
  | { type: 'shell'; command: string }

export interface LabDebrief {
  /** What the learner accomplished, in plain language. */
  summary: string
  /** What Git did internally, as ordered bullets. Shown next to the graph replay. */
  internals: string[]
  /** Commands worth remembering from this lab. */
  keyCommands: { command: string; note: string }[]
  commonMistakes: string[]
  atWork: string
  interview?: string
}

export interface LabDefinition {
  /** Stable id, kebab-case, unique across all labs. */
  id: string
  schemaVersion: 1
  track: string
  order: number
  title: string
  estimatedMinutes: number
  difficulty: 'intro' | 'core' | 'advanced'
  skills: string[]
  scenario: {
    company: string
    role: string
    /** Markdown-lite paragraphs (blank-line separated; `code` spans and bullet lists allowed). */
    brief: string
    whyItMatters: string
  }
  workspace: {
    /** Directory under the learner's home where the shell starts. */
    projectDir: string
    /** Preconfigured identity (omit to force the learner to configure it). */
    identity?: Persona | null
  }
  cast?: Record<string, Persona>
  seed: {
    /** Starting timestamp for seeded commits (ISO date). Each step advances by `stepMinutes`. */
    startDate?: string
    stepMinutes?: number
    steps: SeedStep[]
  }
  objectives: Objective[]
  debrief: LabDebrief
  /** Reference solution as shell lines (interactive answers included); used by tests. */
  solution: string[]
}

export type TrackItem = { type: 'lesson' | 'lab'; id: string }

export interface TrackDefinition {
  id: string
  order: number
  title: string
  tagline: string
  description: string
  /** Ordered lessons and labs. Learners progress through them one at a time. */
  items: TrackItem[]
}

export interface QuizQuestion {
  question: string
  options: string[]
  /** Index into options. */
  answer: number
  explanation: string
}

/** A reading lesson with a short self-check. Completed when every question is answered correctly. */
export interface LessonDefinition {
  id: string
  track: string
  order: number
  title: string
  estimatedMinutes: number
  summary: string
  sections: { heading: string; body: string }[]
  takeaways: string[]
  quiz: QuizQuestion[]
  /** Optional outside videos (plain links, never embedded). */
  videos?: { title: string; url: string; channel?: string; note?: string }[]
}
