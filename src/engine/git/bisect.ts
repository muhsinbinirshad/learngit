import type { Repo } from './repo'
import { shortOid, subjectOf } from './repo'
import { fatal } from './errors'
import { revList } from './history'
import { switchTo } from './checkout'

/** Remaining suspects: reachable from bad, not from any good. */
async function candidates(repo: Repo, bad: string, good: string[]): Promise<string[]> {
  const list = await revList(repo, [bad], good)
  return list.map((c) => c.oid)
}

export async function bisectStart(repo: Repo, badRev?: string, goodRevs: string[] = []): Promise<string[]> {
  if (await repo.getBisectState()) throw fatal(`a bisect is already in progress. Run 'git bisect reset' first.`)
  const branch = await repo.currentBranch()
  const head = await repo.headOid()
  if (!head) throw fatal('no commits to bisect')
  const state = { bad: null as string | null, good: [] as string[], startRef: branch ?? head, log: ['git bisect start'] }
  await repo.setBisectState(state)
  const lines: string[] = []
  if (badRev) lines.push(...(await bisectMark(repo, 'bad', badRev)))
  for (const g of goodRevs) lines.push(...(await bisectMark(repo, 'good', g)))
  if (!lines.length) lines.push('status: waiting for both good and bad commits')
  return lines
}

export async function bisectMark(repo: Repo, verdict: 'good' | 'bad', rev?: string): Promise<string[]> {
  const state = await repo.getBisectState()
  if (!state) throw fatal(`You need to start by "git bisect start"`)
  const oid = await repo.resolveRevision(rev ?? 'HEAD')
  if (verdict === 'bad') state.bad = oid
  else if (!state.good.includes(oid)) state.good.push(oid)
  state.log.push(`git bisect ${verdict} ${shortOid(oid)}`)
  await repo.setBisectState(state)
  if (!state.bad) return ['status: waiting for bad commit, 1 good commit known']
  if (!state.good.length) return ['status: waiting for good commit(s), bad commit known']
  return bisectStep(repo)
}

async function bisectStep(repo: Repo): Promise<string[]> {
  const state = (await repo.getBisectState())!
  const suspects = await candidates(repo, state.bad!, state.good)
  if (suspects.length === 0) {
    return ['The merge base is bad. This means the bug has been fixed between the good and bad commits, or the marks are swapped.']
  }
  if (suspects.length === 1) {
    const oid = suspects[0]!
    const { commit } = await repo.readCommit(oid)
    const date = new Date(commit.author.timestamp * 1000).toUTCString()
    return [
      `${oid} is the first bad commit`,
      `commit ${oid}`,
      `Author: ${commit.author.name} <${commit.author.email}>`,
      `Date:   ${date}`,
      '',
      `    ${subjectOf(commit.message)}`,
      '',
      `Run 'git bisect reset' to return to ${state.startRef}.`,
    ]
  }
  // Midpoint: candidates are newest-first; pick the one in the middle.
  const mid = suspects[Math.floor(suspects.length / 2)]!
  const stepsLeft = Math.ceil(Math.log2(suspects.length))
  await switchTo(repo, mid, { detach: true })
  const { commit } = await repo.readCommit(mid)
  return [
    `Bisecting: ${Math.floor((suspects.length - 1) / 2)} revision${suspects.length - 1 === 1 ? '' : 's'} left to test after this (roughly ${stepsLeft} step${stepsLeft === 1 ? '' : 's'})`,
    `[${mid}] ${subjectOf(commit.message)}`,
  ]
}

export async function bisectReset(repo: Repo): Promise<string[]> {
  const state = await repo.getBisectState()
  if (!state) return ['We are not bisecting.']
  await repo.setBisectState(null)
  const result = await switchTo(repo, state.startRef, {})
  return result.message
}

export async function bisectLog(repo: Repo): Promise<string[]> {
  const state = await repo.getBisectState()
  if (!state) throw fatal('We are not bisecting.')
  return state.log
}
