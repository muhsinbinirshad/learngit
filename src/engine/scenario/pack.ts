import type { FsClient } from '../fs'
import { listFilesRecursive, mkdirp, rmrf, writeFileDeep } from '../fs'
import { Repo } from '../git/repo'

/**
 * A seed pack is a serialized snapshot of a whole repository directory — the working tree *and*
 * the entire `.git` (objects, refs, HEAD, index, reflogs). Loading it reconstructs the repository
 * byte-for-byte, so commit oids, refs and history are preserved exactly.
 *
 * This is the path labs take when they start from a snapshot of the Ledgerly codebase: a repo with
 * ~150–250 commits is impractical to rebuild from `seed.steps`, and replaying would not reproduce
 * the original commit hashes. A pack freezes them, which also lets a sandbox snapshot and its real
 * GitHub template repo share identical object ids.
 *
 * Packs capture whatever files the source repo has. A packed source repo (`git gc`) serializes as a
 * couple of packfiles rather than thousands of loose objects, which keeps both the pack and the
 * IndexedDB write small — prefer packing the source before exporting a large codebase.
 */
export interface SeedPack {
  version: 1
  /** Repo-relative path (e.g. `src/app.ts`, `.git/HEAD`) -> base64-encoded file bytes. */
  files: Record<string, string>
  /** Informational summary of the captured state; the files are the source of truth. */
  manifest: SeedPackManifest
}

export interface SeedPackManifest {
  /** HEAD commit oid, or null for an unborn branch. */
  head: string | null
  /** Branch HEAD points at, or null when detached. */
  branch: string | null
  /** Every ref and its resolved oid, for inspection and sanity checks. */
  refs: { name: string; oid: string }[]
  /** Commit labels important to lab checks (bisect regression, leaked key, rebase tip, …). */
  labels?: Record<string, string>
}

const CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Serialize an existing repository directory into a seed pack. Used by the Ledgerly build pipeline
 * (and tests) to turn a real git repo into a sandbox snapshot. `labels` records commit oids that
 * lab checks reference by name.
 */
export async function exportSeedPack(fs: FsClient, repoDir: string, opts: { labels?: Record<string, string> } = {}): Promise<SeedPack> {
  const files: Record<string, string> = {}
  // Include `.git`: the whole point is to preserve objects, refs, HEAD, index and reflogs.
  const paths = await listFilesRecursive(fs, repoDir, false)
  const prefix = repoDir.endsWith('/') ? repoDir : `${repoDir}/`
  for (const abs of paths) {
    const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs
    const data = await fs.promises.readFile(abs)
    files[rel] = bytesToBase64(typeof data === 'string' ? new TextEncoder().encode(data) : data)
  }

  const repo = new Repo(fs, repoDir)
  const refs = (await repo.listAllRefs()).map((r) => ({ name: r.name, oid: r.oid }))
  const manifest: SeedPackManifest = {
    head: await repo.headOid(),
    branch: await repo.currentBranch(),
    refs,
    ...(opts.labels && Object.keys(opts.labels).length ? { labels: opts.labels } : {}),
  }
  return { version: 1, files, manifest }
}

/**
 * Load a seed pack into `repoDir`, replacing whatever is there. Deterministic and repeatable, so it
 * also backs "Reset lab" for pack-based labs. The working tree and index come from the pack, so no
 * checkout is needed and `git status` is clean immediately.
 */
export async function loadSeedPack(fs: FsClient, repoDir: string, pack: SeedPack): Promise<void> {
  if (pack.version !== 1) throw new Error(`seed pack: unsupported version ${pack.version}`)
  await rmrf(fs, repoDir)
  await mkdirp(fs, repoDir)
  const prefix = repoDir.endsWith('/') ? repoDir : `${repoDir}/`
  for (const [rel, b64] of Object.entries(pack.files)) {
    await writeFileDeep(fs, `${prefix}${rel}`, base64ToBytes(b64))
  }
}
