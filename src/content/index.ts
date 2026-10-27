import type { LabDefinition, LabMode, LessonDefinition, TrackDefinition, TrackItem } from '@/engine/scenario/types'
import { validateLabDefinition } from '@/engine/scenario/validate'
import { isPackName, loadPack } from './packs'
import tracksJson from './tracks.json'
import t1HelloGit from './labs/t1-hello-git.json'
import t1FirstCommit from './labs/t1-first-commit.json'
import t1ChangeAndCommit from './labs/t1-change-and-commit.json'
import t1ChooseWhatToSave from './labs/t1-choose-what-to-save.json'
import t1GoodMessages from './labs/t1-good-messages.json'
import t1ReadHistory from './labs/t1-read-history.json'
import t1IgnoreFiles from './labs/t1-ignore-files.json'
import t2FeatureBranch from './labs/t2-feature-branch.json'
import t2MergeShapes from './labs/t2-merge-shapes.json'
import t2MergeConflict from './labs/t2-merge-conflict.json'
import t2Stash from './labs/t2-stash.json'
import t3Setup from './labs/t3-setup.json'
import t3OpenPr from './labs/t3-open-pr.json'
import t4RebaseClean from './labs/t4-rebase-clean.json'
import t4CherryPick from './labs/t4-cherry-pick.json'
import t5Reflog from './labs/t5-reflog.json'
import t5Revert from './labs/t5-revert.json'
import t6Release from './labs/t6-release.json'
import t6BranchProtection from './labs/t6-branch-protection.json'
import t6Codeowners from './labs/t6-codeowners.json'
import l0WhatIsGit from './lessons/l0-what-is-git.json'
import l0CoreWords from './lessons/l0-core-words.json'
import l0HowTeamsWork from './lessons/l0-how-teams-work.json'
import l0GitVsHub from './lessons/l0-git-vs-hub.json'
import l0CiCd from './lessons/l0-ci-cd.json'
import l0Terminal from './lessons/l0-terminal-and-platform.json'
import l1ThreePlaces from './lessons/l1-three-places.json'
import l1GoodMessages from './lessons/l1-good-messages.json'
import l1IgnoreAndSecrets from './lessons/l1-ignore-and-secrets.json'
import l2Branches from './lessons/l2-branches.json'
import l2Merging from './lessons/l2-merging-and-conflicts.json'

const rawLabs = [
  t1HelloGit,
  t1FirstCommit,
  t1ChangeAndCommit,
  t1ChooseWhatToSave,
  t1GoodMessages,
  t1ReadHistory,
  t1IgnoreFiles,
  t2FeatureBranch,
  t2MergeShapes,
  t2MergeConflict,
  t2Stash,
  t3Setup,
  t3OpenPr,
  t4RebaseClean,
  t4CherryPick,
  t5Reflog,
  t5Revert,
  t6Release,
  t6BranchProtection,
  t6Codeowners,
] as unknown as LabDefinition[]
const rawLessons = [
  l0WhatIsGit,
  l0CoreWords,
  l0HowTeamsWork,
  l0GitVsHub,
  l0CiCd,
  l0Terminal,
  l1ThreePlaces,
  l1GoodMessages,
  l1IgnoreAndSecrets,
  l2Branches,
  l2Merging,
] as unknown as LessonDefinition[]

for (const lab of rawLabs) {
  const errors = validateLabDefinition(lab)
  if (errors.length) throw new Error(`Invalid lab definition ${lab.id}: ${errors.join('; ')}`)
}

export const labs: LabDefinition[] = rawLabs
export const lessons: LessonDefinition[] = rawLessons
export const labsById: Record<string, LabDefinition> = Object.fromEntries(labs.map((l) => [l.id, l]))
export const lessonsById: Record<string, LessonDefinition> = Object.fromEntries(lessons.map((l) => [l.id, l]))
export const tracks: TrackDefinition[] = (tracksJson as TrackDefinition[]).slice().sort((a, b) => a.order - b.order)
export const tracksById: Record<string, TrackDefinition> = Object.fromEntries(tracks.map((t) => [t.id, t]))

export function trackItems(trackId: string): TrackItem[] {
  return tracksById[trackId]?.items ?? []
}

/**
 * Resolve a lab's `seed.packRef` (a pack name) into an inline `seed.pack` by loading the seed pack,
 * so the engine seeder can start the repository from the Ledgerly snapshot. Labs without a packRef
 * are returned unchanged. Call this before seedLab (the lab workspace and the content tests do).
 */
export async function resolveLabForSeed(lab: LabDefinition): Promise<LabDefinition> {
  const ref = lab.seed.packRef
  if (!ref) return lab
  if (!isPackName(ref)) throw new Error(`lab ${lab.id}: unknown seed packRef "${ref}"`)
  const pack = await loadPack(ref)
  return { ...lab, seed: { ...lab.seed, pack } }
}

export function labsForTrack(trackId: string): LabDefinition[] {
  return trackItems(trackId)
    .filter((i) => i.type === 'lab')
    .map((i) => labsById[i.id])
    .filter((l): l is LabDefinition => !!l)
}

export function lessonsForTrack(trackId: string): LessonDefinition[] {
  return trackItems(trackId)
    .filter((i) => i.type === 'lesson')
    .map((i) => lessonsById[i.id])
    .filter((l): l is LessonDefinition => !!l)
}

export interface ResolvedItem {
  type: 'lesson' | 'lab'
  id: string
  title: string
  estimatedMinutes: number
  track: string
  href: string
  /** Lab mode, for the Sandbox / Real GitHub badge. Lessons and sandbox labs are "sandbox". */
  mode: LabMode
}

export function resolveItem(item: TrackItem): ResolvedItem | null {
  if (item.type === 'lab') {
    const lab = labsById[item.id]
    return lab ? { type: 'lab', id: lab.id, title: lab.title, estimatedMinutes: lab.estimatedMinutes, track: lab.track, href: `/labs/${lab.id}`, mode: lab.mode ?? 'sandbox' } : null
  }
  const lesson = lessonsById[item.id]
  return lesson
    ? { type: 'lesson', id: lesson.id, title: lesson.title, estimatedMinutes: lesson.estimatedMinutes, track: lesson.track, href: `/lessons/${lesson.id}`, mode: 'sandbox' }
    : null
}

/** The modes present in a track, for the track-level badge(s). */
export function trackModes(trackId: string): LabMode[] {
  const modes = new Set(itemsForTrack(trackId).map((i) => i.mode))
  return (['sandbox', 'github'] as LabMode[]).filter((m) => modes.has(m))
}

export function itemsForTrack(trackId: string): ResolvedItem[] {
  return trackItems(trackId)
    .map(resolveItem)
    .filter((i): i is ResolvedItem => !!i)
}

/** All items across all tracks, in learning order. */
export const allItems: ResolvedItem[] = tracks.flatMap((t) => itemsForTrack(t.id))

/** The item after `id` in learning order (crosses into the next track). */
export function nextItem(id: string): ResolvedItem | null {
  const idx = allItems.findIndex((i) => i.id === id)
  return idx >= 0 ? (allItems[idx + 1] ?? null) : null
}

/** The lab after `labId` in learning order (skips lessons). */
export function nextLab(labId: string): LabDefinition | null {
  const idx = allItems.findIndex((i) => i.id === labId)
  const next = allItems.slice(idx + 1).find((i) => i.type === 'lab')
  return next ? (labsById[next.id] ?? null) : null
}

export const SKILL_LABELS: Record<string, string> = {
  commits: 'Commits',
  staging: 'Staging',
  history: 'Reading history',
  hygiene: 'Repository hygiene',
  branching: 'Branching',
  merging: 'Merging',
  conflicts: 'Conflict resolution',
  stash: 'Stash',
  rebasing: 'Rebasing',
  remotes: 'Remotes',
  collaboration: 'Collaboration',
  review: 'Code review',
  recovery: 'Recovery',
  workflows: 'Team workflows',
  releases: 'Releases',
}

// ---- Sequential unlocking --------------------------------------------------------------------

export interface ProgressSnapshot {
  labs: Record<string, { status: string }>
  lessons: Record<string, { status: string }>
}

/** Ids of every completed lesson and lab. */
export function completedIds(progress: ProgressSnapshot): Set<string> {
  const out = new Set<string>()
  for (const [id, p] of Object.entries(progress.labs)) if (p.status === 'completed') out.add(id)
  for (const [id, p] of Object.entries(progress.lessons)) if (p.status === 'completed') out.add(id)
  return out
}

export interface TrackUnlock {
  unlocked: boolean
  requires?: TrackDefinition
}

/** A track opens once every item in the previous track is completed. */
export function trackUnlock(trackId: string, completed: Set<string>): TrackUnlock {
  const track = tracksById[trackId]
  if (!track) return { unlocked: false }
  const previous = tracks.filter((t) => t.order < track.order).sort((a, b) => b.order - a.order)[0]
  if (!previous) return { unlocked: true }
  const previousDone = previous.items.length > 0 && previous.items.every((i) => completed.has(i.id))
  return { unlocked: previousDone && trackUnlock(previous.id, completed).unlocked, requires: previous }
}

export interface ItemUnlock {
  unlocked: boolean
  requires?: ResolvedItem
  trackLocked: boolean
}

/** Items open one at a time: item N is available once item N-1 in the same track is completed. */
export function itemUnlock(id: string, completed: Set<string>): ItemUnlock {
  const item = allItems.find((i) => i.id === id)
  if (!item) return { unlocked: false, trackLocked: true }
  if (!trackUnlock(item.track, completed).unlocked) return { unlocked: false, trackLocked: true }
  const inTrack = itemsForTrack(item.track)
  const idx = inTrack.findIndex((i) => i.id === id)
  const previous = idx > 0 ? inTrack[idx - 1] : undefined
  if (!previous) return { unlocked: true, trackLocked: false }
  return { unlocked: completed.has(previous.id), requires: previous, trackLocked: false }
}

export type ItemState = 'done' | 'current' | 'open' | 'locked'

export function itemState(item: ResolvedItem, progress: ProgressSnapshot, completed: Set<string>): ItemState {
  if (completed.has(item.id)) return 'done'
  if (!itemUnlock(item.id, completed).unlocked) return 'locked'
  if (item.type === 'lab' && progress.labs[item.id]?.status === 'in-progress') return 'current'
  return 'open'
}

/** Total minutes for a track's items. */
export function trackMinutes(trackId: string): number {
  return itemsForTrack(trackId).reduce((n, i) => n + i.estimatedMinutes, 0)
}
