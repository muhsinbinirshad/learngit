import type { LabDefinition, Check } from './types'

const CHECK_TYPES = new Set([
  'branchExists',
  'branchNotExists',
  'headOnBranch',
  'headDetached',
  'headEquals',
  'commitCount',
  'commitMessageMatches',
  'commitMessageFormat',
  'commitAuthor',
  'commitTouchesOnly',
  'commitChangesPath',
  'headIsMergeCommit',
  'mergeCommitWithParent',
  'linearHistory',
  'refContains',
  'refsEqual',
  'tagExists',
  'fileExists',
  'fileNotExists',
  'fileContains',
  'fileNotContains',
  'fileTracked',
  'fileNotTracked',
  'fileStaged',
  'fileHasUnstagedChanges',
  'fileIgnored',
  'workingTreeClean',
  'noStagedChanges',
  'noConflictMarkers',
  'noConflicts',
  'noOperationInProgress',
  'stashCount',
  'configSet',
  'reflogContains',
  'remoteBranchEquals',
  'remoteBranchExists',
  'not',
  'all',
  'any',
])

/** Lightweight structural validation of a lab definition (the JSON schema is the formal contract). */
export function validateLabDefinition(lab: unknown): string[] {
  const errors: string[] = []
  const l = lab as Partial<LabDefinition>
  const req = (k: keyof LabDefinition) => {
    if (l[k] === undefined) errors.push(`missing ${k}`)
  }
  for (const k of [
    'id',
    'schemaVersion',
    'track',
    'order',
    'title',
    'estimatedMinutes',
    'difficulty',
    'skills',
    'scenario',
    'workspace',
    'seed',
    'objectives',
    'debrief',
    'solution',
  ] as (keyof LabDefinition)[])
    req(k)
  if (l.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.id)) errors.push('id must be kebab-case')
  if (l.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  const ids = new Set<string>()
  for (const o of l.objectives ?? []) {
    if (ids.has(o.id)) errors.push(`duplicate objective id ${o.id}`)
    ids.add(o.id)
    if (!o.hints?.length || o.hints.length > 3) errors.push(`objective ${o.id} needs 1-3 hints`)
    walkCheck(o.check, (c) => {
      if (!CHECK_TYPES.has(c.type)) errors.push(`objective ${o.id}: unknown check type ${c.type}`)
    })
  }
  if (l.scenario && /lorem ipsum/i.test(l.scenario.brief)) errors.push('placeholder copy in brief')
  if (!l.solution?.length) errors.push('solution must list at least one command')
  return errors
}

function walkCheck(c: Check, fn: (c: Check) => void): void {
  fn(c)
  if (c.type === 'not') walkCheck(c.check, fn)
  if (c.type === 'all' || c.type === 'any') for (const x of c.checks) walkCheck(x, fn)
}
