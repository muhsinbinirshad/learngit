// @ts-check
/**
 * Ledgerly history generator + seed-pack / template exporter.
 *
 * Builds a deterministic ~realistic git history for the Ledgerly codebase (fictional fintech),
 * plants the situations later labs need (a bisect regression, a leaked fake key, a messy feature
 * branch), and exports:
 *   - named seed packs (src/content/packs/<name>.json) the in-browser engine can load,
 *   - a GitHub template tree (for Phase 5 provisioning),
 *   - the runnable `ledgerly/` source is the source of truth for HEAD; a reconciliation step
 *     guarantees main's HEAD tree matches it exactly.
 *
 * Determinism: every commit/tag uses a fixed author, committer, timestamp and timezone, so re-running
 * produces identical commit hashes. Run from the project root:
 *   node scripts/ledgerly/build.mjs            # write packs into src/content/packs
 *   node scripts/ledgerly/build.mjs --template <dir>
 *   node scripts/ledgerly/build.mjs --repo <dir>   # also leave the built git repo on disk
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import git from 'isomorphic-git'

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const LEDGERLY = path.join(ROOT, 'ledgerly')
const PACKS_DIR = path.join(ROOT, 'src', 'content', 'packs')

// ---- fictional team (also the CODEOWNERS org) ----------------------------------------------------
export const TEAM = {
  ada: { name: 'Ada Reyes', email: 'ada.reyes@ledgerly.example' },
  kofi: { name: 'Kofi Mensah', email: 'kofi.mensah@ledgerly.example' },
  mira: { name: 'Mira Shah', email: 'mira.shah@ledgerly.example' },
  luca: { name: 'Luca Rossi', email: 'luca.rossi@ledgerly.example' },
  priya: { name: 'Priya Nair', email: 'priya.nair@ledgerly.example' },
  dmitri: { name: 'Dmitri Volkov', email: 'dmitri.volkov@ledgerly.example' },
  sofia: { name: 'Sofia Marin', email: 'sofia.marin@ledgerly.example' },
  noah: { name: 'Noah Cohen', email: 'noah.cohen@ledgerly.example' },
}

// ---- deterministic clock -------------------------------------------------------------------------
// Commits start 2024-05-06 09:00 UTC and advance by a seeded, business-hours-ish gap each time.
let tick = 0
const START = Math.floor(Date.parse('2024-05-06T09:00:00Z') / 1000)
let seed = 1234567
function rng() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function nextTime() {
  // 20 min – 30 h between commits, deterministic.
  tick += Math.floor(20 * 60 + rng() * 30 * 3600)
  return START + tick
}
function sig(who) {
  const t = nextTime()
  return { name: who.name, email: who.email, timestamp: t, timezoneOffset: 0 }
}

// ---- low-level repo helpers ----------------------------------------------------------------------
let DIR = ''
let WRITE_PACKS = true
const G = () => ({ fs, dir: DIR })

function wf(rel, content) {
  const abs = path.join(DIR, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}
function rm(rel) {
  const abs = path.join(DIR, rel)
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true })
}

/** Apply file writes/deletes, stage them, and commit with a fixed signature. Returns the oid. */
async function commit(who, message, { write = {}, del = [] } = {}) {
  for (const [rel, content] of Object.entries(write)) wf(rel, content)
  for (const rel of del) rm(rel)
  for (const rel of Object.keys(write)) await git.add({ ...G(), filepath: rel })
  for (const rel of del) await git.remove({ ...G(), filepath: rel })
  const author = sig(who)
  const oid = await git.commit({ ...G(), message, author, committer: author })
  return oid
}

async function branch(name) {
  await git.branch({ ...G(), ref: name })
}
async function checkout(ref) {
  await git.checkout({ ...G(), ref, force: true })
}
async function tag(name, message) {
  const t = nextTime()
  const tagger = { name: TEAM.ada.name, email: TEAM.ada.email, timestamp: t, timezoneOffset: 0 }
  await git.annotatedTag({ ...G(), ref: name, message, tagger, object: await git.resolveRef({ ...G(), ref: 'HEAD' }) })
}
/** Merge `theirs` into the current branch as a real merge commit (no fast-forward). */
async function merge(theirs, who, message) {
  const author = sig(who)
  await git.merge({ ...G(), theirs, fastForward: false, mergeDriver: undefined, author, committer: author, message })
}

// ---- pack export ---------------------------------------------------------------------------------
function b64(buf) {
  return Buffer.from(buf).toString('base64')
}
function walkFiles(dir, base = dir, out = {}) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === 'node_modules') continue
    const abs = path.join(dir, name)
    const st = fs.lstatSync(abs)
    if (st.isDirectory()) walkFiles(abs, base, out)
    else out[path.relative(base, abs).split(path.sep).join('/')] = fs.readFileSync(abs)
  }
  return out
}
async function listRefs() {
  const refs = []
  for (const b of await git.listBranches(G())) refs.push({ name: `refs/heads/${b}`, oid: await git.resolveRef({ ...G(), ref: `refs/heads/${b}` }) })
  for (const t of await git.listTags(G())) refs.push({ name: `refs/tags/${t}`, oid: await git.resolveRef({ ...G(), ref: `refs/tags/${t}` }) })
  return refs
}
async function currentBranch() {
  return (await git.currentBranch(G())) ?? null
}
async function exportPack(name, labels = {}) {
  const files = {}
  const raw = walkFiles(DIR)
  for (const [rel, buf] of Object.entries(raw)) files[rel] = b64(buf)
  let head = null
  try {
    head = await git.resolveRef({ ...G(), ref: 'HEAD' })
  } catch {
    /* unborn */
  }
  const pack = { version: 1, files, manifest: { head, branch: await currentBranch(), refs: await listRefs(), labels } }
  if (WRITE_PACKS) {
    fs.mkdirSync(PACKS_DIR, { recursive: true })
    fs.writeFileSync(path.join(PACKS_DIR, `${name}.json`), JSON.stringify(pack))
  }
  return pack
}

// ---- final source (HEAD) -------------------------------------------------------------------------
/** The real, runnable ledgerly/ tree — the source of truth for main's HEAD. */
function finalFiles() {
  return walkFiles(LEDGERLY)
}

// ================================================================================================
// The history.
// ================================================================================================
export async function build({ repoDir, writePacks = true } = {}) {
  // Reset the deterministic clock so repeated calls (and the determinism test) reproduce exactly.
  tick = 0
  seed = 1234567
  WRITE_PACKS = writePacks
  DIR = repoDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerly-'))
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })
  await git.init({ ...G(), defaultBranch: 'main' })

  const FINAL = finalFiles()
  const f = (rel) => {
    const v = FINAL[rel]
    if (v === undefined) throw new Error(`generator references missing ledgerly file: ${rel}`)
    return v
  }
  const labels = {}

  // --- 0.1.0: scaffold -----------------------------------------------------------------------
  await commit(TEAM.ada, 'chore: initialize repository', { write: { '.gitignore': f('.gitignore'), 'README.md': '# Ledgerly\n\nInvoicing for small teams.\n' } })
  await commit(TEAM.ada, 'chore: add package manifest and tsconfig', { write: { 'package.json': f('package.json'), 'tsconfig.base.json': f('tsconfig.base.json'), 'tsconfig.json': f('tsconfig.json') } })
  await commit(TEAM.dmitri, 'chore(ci): add continuous integration workflow', { write: { '.github/workflows/ci.yml': f('.github/workflows/ci.yml') } })

  // --- shared domain -------------------------------------------------------------------------
  await commit(TEAM.kofi, 'feat(shared): add money type in integer minor units', { write: { 'packages/shared/package.json': f('packages/shared/package.json'), 'packages/shared/src/money.ts': f('packages/shared/src/money.ts') } })
  await commit(TEAM.kofi, 'test(shared): cover money math and formatting', { write: { 'packages/shared/src/money.test.ts': f('packages/shared/src/money.test.ts') } })
  await commit(TEAM.kofi, 'feat(shared): add ISO day date helpers', { write: { 'packages/shared/src/date.ts': f('packages/shared/src/date.ts') } })
  await commit(TEAM.luca, 'test(shared): cover date helpers', { write: { 'packages/shared/src/date.test.ts': f('packages/shared/src/date.test.ts') } })
  await commit(TEAM.kofi, 'feat(shared): add invoice and line-item types', { write: { 'packages/shared/src/types.ts': f('packages/shared/src/types.ts'), 'packages/shared/src/index.ts': f('packages/shared/src/index.ts') } })

  labels.firstDay = await git.resolveRef({ ...G(), ref: 'HEAD' })
  await exportPack('t1-first-day', { start: labels.firstDay })

  // --- api -----------------------------------------------------------------------------------
  await commit(TEAM.ada, 'feat(api): scaffold api package', { write: { 'api/package.json': f('api/package.json') } })
  await commit(TEAM.ada, 'feat(api): compute invoice subtotal and totals', { write: { 'api/src/invoice.ts': f('api/src/invoice.ts') } })
  await commit(TEAM.luca, 'test(api): cover invoice totals', { write: { 'api/src/invoice.test.ts': f('api/src/invoice.test.ts') } })
  await commit(TEAM.ada, 'feat(api): add invoice status transitions', { write: { 'api/src/status.ts': f('api/src/status.ts') } })
  await commit(TEAM.luca, 'test(api): cover status transitions', { write: { 'api/src/status.test.ts': f('api/src/status.test.ts') } })
  await commit(TEAM.dmitri, 'feat(api): load configuration from environment', { write: { 'api/src/config.ts': f('api/src/config.ts'), '.env.example': f('.env.example') } })

  await tag('v0.1.0', 'Ledgerly 0.1.0 — first scaffold')

  // --- web -----------------------------------------------------------------------------------
  await commit(TEAM.mira, 'feat(web): scaffold web package', { write: { 'web/package.json': f('web/package.json') } })
  await commit(TEAM.mira, 'feat(web): format invoices for the list view', { write: { 'web/src/formatInvoice.ts': f('web/src/formatInvoice.ts') } })
  await commit(TEAM.priya, 'test(web): cover invoice row formatting', { write: { 'web/src/formatInvoice.test.ts': f('web/src/formatInvoice.test.ts') } })
  await commit(TEAM.sofia, 'feat(web): add invoice list component', { write: { 'web/src/InvoiceList.tsx': f('web/src/InvoiceList.tsx') } })
  await commit(TEAM.mira, 'feat(web): add app shell', { write: { 'web/src/App.tsx': f('web/src/App.tsx') } })

  // --- engineering docs (feature branch merged no-ff) ----------------------------------------
  await branch('docs/engineering-handbook')
  await checkout('docs/engineering-handbook')
  await commit(TEAM.noah, 'docs: add contributing guide', { write: { 'CONTRIBUTING.md': f('CONTRIBUTING.md') } })
  await commit(TEAM.noah, 'docs: add code owners', { write: { 'CODEOWNERS': f('CODEOWNERS') } })
  await commit(TEAM.dmitri, 'docs: add security policy', { write: { 'SECURITY.md': f('SECURITY.md') } })
  await commit(TEAM.noah, 'docs: add issue and pull request templates', {
    write: {
      '.github/pull_request_template.md': f('.github/pull_request_template.md'),
      '.github/ISSUE_TEMPLATE/bug_report.md': f('.github/ISSUE_TEMPLATE/bug_report.md'),
      '.github/ISSUE_TEMPLATE/feature_request.md': f('.github/ISSUE_TEMPLATE/feature_request.md'),
    },
  })
  await checkout('main')
  await merge('docs/engineering-handbook', TEAM.noah, "Merge branch 'docs/engineering-handbook'")

  // --- containerization ----------------------------------------------------------------------
  await commit(TEAM.dmitri, 'chore(docker): add production Dockerfile', { write: { Dockerfile: f('Dockerfile'), '.dockerignore': f('.dockerignore') } })
  await commit(TEAM.ada, 'feat(api): serve health and invoices endpoints', { write: { 'api/src/server.ts': f('api/src/server.ts') } })

  // --- CHANGELOG, built up release by release (volume + realism) ------------------------------
  const changelog = splitChangelog(f('CHANGELOG.md').toString())
  await commit(TEAM.noah, 'docs: start changelog', { write: { 'CHANGELOG.md': changelog.header + changelog.sections['0.1.0'] } })
  await bumpVersion('0.2.0')
  await maintenanceSeries(50)

  // --- 1.0.0 release branch + tag ------------------------------------------------------------
  await bumpVersion('1.0.0')
  await commit(TEAM.noah, 'docs: record 1.0.0 in changelog', { write: { 'CHANGELOG.md': changelog.upTo('1.0.0') } })
  await branch('release/1.0')
  await tag('v1.0.0', 'Ledgerly 1.0.0 — first stable release')

  // --- planted: messy feature branch (left unmerged for an interactive-rebase lab) -----------
  await branch('feature/csv-export')
  await checkout('feature/csv-export')
  await commit(TEAM.priya, 'wip: start csv export', { write: { 'api/src/export.ts': 'export function toCsv() {\n  return ""\n}\n' } })
  await commit(TEAM.priya, 'wip', { write: { 'api/src/export.ts': 'export function toCsv(rows: string[][]) {\n  return rows.join("\\n")\n}\n' } })
  await commit(TEAM.priya, 'oops fix typo', { write: { 'api/src/export.ts': 'export function toCsv(rows: string[][]) {\n  return rows.map((r) => r.join(",")).join("\\n")\n}\n' } })
  await commit(TEAM.priya, 'more', { write: { 'api/src/export.test.ts': 'import { test } from "node:test"\nimport assert from "node:assert/strict"\nimport { toCsv } from "./export.ts"\ntest("toCsv", () => assert.equal(toCsv([["a","b"]]), "a,b"))\n' } })
  await commit(TEAM.priya, 'address review comments', { write: { 'api/src/export.ts': 'export function toCsv(rows: string[][]): string {\n  return rows.map((r) => r.map(escape).join(",")).join("\\n")\n}\nfunction escape(v: string): string {\n  return /[",\\n]/.test(v) ? `"${v.replace(/"/g, \'""\')}"` : v\n}\n' } })
  labels.messyTip = await git.resolveRef({ ...G(), ref: 'HEAD' })
  await exportPack('t4-rebase', { tip: labels.messyTip, base: labels.firstDay })
  await checkout('main')

  // --- planted: merge-conflict setup (two branches editing the same README line) -------------
  // Record main's current README, create a branch that rewrites its tagline, then main rewrites it
  // differently. Diverged + unmerged => merging triggers a real conflict in the lab.
  const readmeBase = '# Ledgerly\n\nInvoicing for small teams.\n'
  await commit(TEAM.mira, 'docs: expand readme intro', { write: { 'README.md': readmeBase } })
  const branchPoint = await git.resolveRef({ ...G(), ref: 'HEAD' })
  await branch('feature/tagline')
  await checkout('feature/tagline')
  await commit(TEAM.sofia, 'docs: sharpen the product tagline', { write: { 'README.md': '# Ledgerly\n\nGet paid faster. Invoicing for small teams.\n' } })
  await checkout('main')
  await commit(TEAM.mira, 'docs: reword the product tagline', { write: { 'README.md': '# Ledgerly\n\nInvoicing that does the chasing for you.\n' } })
  labels.conflictBranchPoint = branchPoint
  await exportPack('t2-merge-conflict', { base: branchPoint })
  // feature/tagline is left unmerged.

  // --- planted: bisect regression ------------------------------------------------------------
  // A refactor quietly breaks percentOf rounding; the money test now fails. Exported as t5-bisect.
  await tag('v1.2.0-good', 'known-good build before the rounding regression')
  const buggyMoney = f('packages/shared/src/money.ts').toString().replace('return { amount: Math.round((m.amount * percent) / 100), currency: m.currency }', 'return { amount: Math.floor((m.amount * percent) / 100), currency: m.currency }')
  await commit(TEAM.luca, 'refactor(shared): simplify percentOf rounding', { write: { 'packages/shared/src/money.ts': buggyMoney } })
  // a few more commits so the bad commit is buried mid-range
  await maintenanceSeries(4)
  labels.bisectBad = await git.resolveRef({ ...G(), ref: 'HEAD' })
  await exportPack('t5-bisect', { good: await git.resolveRef({ ...G(), ref: 'v1.2.0-good' }), badTip: labels.bisectBad })
  // main then fixes it (restores the real file).
  await commit(TEAM.kofi, 'fix(shared): restore half-up rounding in percentOf', { write: { 'packages/shared/src/money.ts': f('packages/shared/src/money.ts') } })

  // --- planted: leaked fake key --------------------------------------------------------------
  const KEY = 'sk_live_FAKE_0000NOTAREALKEY0000'
  const leakedConfig = f('api/src/config.ts').toString().replace("const paymentApiKey = env.PAYMENT_API_KEY ?? ''", `const paymentApiKey = env.PAYMENT_API_KEY ?? '${KEY}'`)
  await commit(TEAM.luca, 'chore(api): add temporary payment key for local testing', { write: { 'api/src/config.ts': leakedConfig } })
  labels.leakCommit = await git.resolveRef({ ...G(), ref: 'HEAD' })
  await commit(TEAM.dmitri, 'chore(api): remove hardcoded key, read from env', { write: { 'api/src/config.ts': f('api/src/config.ts') } })
  await exportPack('t6-secret', { leak: labels.leakCommit })

  // --- 1.2.0 / 1.4.x releases ----------------------------------------------------------------
  await bumpVersion('1.2.0')
  await commit(TEAM.noah, 'docs: record 1.2.0 in changelog', { write: { 'CHANGELOG.md': changelog.upTo('1.2.0') } })
  await tag('v1.2.0', 'Ledgerly 1.2.0 — invoice status transitions')
  await maintenanceSeries(56)
  await bumpVersion('1.4.0')
  await commit(TEAM.noah, 'docs: record 1.4.0 in changelog', { write: { 'CHANGELOG.md': changelog.upTo('1.4.0') } })
  await branch('release/1.4')
  await tag('v1.4.0', 'Ledgerly 1.4.0 — overdue badges')
  await maintenanceSeries(50)
  await bumpVersion('1.4.2')
  await commit(TEAM.noah, 'docs: record 1.4.2 in changelog', { write: { 'CHANGELOG.md': f('CHANGELOG.md') } })

  // --- reconcile HEAD to the real ledgerly/ tree ---------------------------------------------
  await reconcile(FINAL)
  await tag('v1.4.2', 'Ledgerly 1.4.2 — rounding fix')

  const head = await git.resolveRef({ ...G(), ref: 'HEAD' })
  labels.head = head
  await exportPack('ledgerly-main', labels)

  return { dir: DIR, head, labels, commitCount: await countCommits() }

  // ---- inner helpers that close over FINAL/labels -------------------------------------------
  async function bumpVersion(v) {
    const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'))
    pkg.version = v
    await commit(TEAM.dmitri, `chore(release): bump version to ${v}`, { write: { 'package.json': JSON.stringify(pkg, null, 2) + '\n' } })
  }
  async function maintenanceSeries(n = 6) {
    const notes = [
      [TEAM.luca, 'test(api): add edge case for zero-quantity lines'],
      [TEAM.kofi, 'refactor(shared): tidy money helpers'],
      [TEAM.mira, 'docs(web): note that totals come from the api'],
      [TEAM.priya, 'test(web): add overdue formatting case'],
      [TEAM.dmitri, 'chore(ci): cache node setup between runs'],
      [TEAM.ada, 'docs(api): document the invoices endpoint'],
      [TEAM.sofia, 'style(web): align invoice table columns'],
      [TEAM.noah, 'docs: clarify branch naming in contributing'],
      [TEAM.kofi, 'test(shared): add currency-mismatch cases'],
      [TEAM.luca, 'refactor(api): extract line-total helper'],
      [TEAM.ada, 'perf(api): avoid recomputing subtotal twice'],
      [TEAM.dmitri, 'chore: pin node version in ci to 22'],
      [TEAM.priya, 'fix(web): guard against empty invoice list'],
      [TEAM.mira, 'docs(web): add component usage notes'],
      [TEAM.sofia, 'style(web): tidy table header casing'],
      [TEAM.noah, 'chore: add editorconfig reference to contributing'],
      [TEAM.kofi, 'test(shared): cover leap-year dates'],
      [TEAM.luca, 'refactor(api): narrow status transition types'],
      [TEAM.dmitri, 'chore(ci): run tests on release branches'],
      [TEAM.ada, 'docs(api): note env vars the service reads'],
      [TEAM.priya, 'test(web): assert overdue only applies to sent'],
      [TEAM.mira, 'chore(web): drop unused import'],
    ]
    for (let i = 0; i < n; i++) {
      const [who, msg] = notes[(tick + i) % notes.length]
      // Each touches a scratch log so the commit has real content; reconciliation removes it later.
      await commit(who, msg, { write: { '.ledgerly-maintenance.log': `${msg}\n` + Array.from({ length: (tick % 7) + 2 }, (_, k) => `- note ${tick}-${k}`).join('\n') + '\n' } })
    }
  }
  async function reconcile(final) {
    // Remove any scratch files not in the final tree, then write every final file exactly.
    const present = walkFiles(DIR)
    const dels = Object.keys(present).filter((rel) => !(rel in final) && !rel.startsWith('.git/'))
    const writes = {}
    for (const [rel, buf] of Object.entries(final)) {
      if (!present[rel] || !present[rel].equals(buf)) writes[rel] = buf
    }
    if (dels.length || Object.keys(writes).length) {
      await commit(TEAM.ada, 'chore: reconcile working tree with release', { write: writes, del: dels })
    }
  }
  async function countCommits() {
    const log = await git.log({ ...G(), ref: 'main' })
    return log.length
  }
}

function splitChangelog(text) {
  // Split the real CHANGELOG into its per-version sections so history can reveal them release by release.
  const [header, ...rest] = text.split(/(?=^## \[)/m)
  const sections = {}
  const order = []
  for (const block of rest) {
    const m = /^## \[([^\]]+)\]/.exec(block)
    if (m) {
      sections[m[1]] = block
      order.push(m[1])
    }
  }
  return {
    header,
    sections,
    /** Changelog containing every section from newest down to and including version `v`. */
    upTo(v) {
      const idx = order.indexOf(v)
      const keep = idx === -1 ? order : order.slice(0, idx + 1)
      return header + keep.map((k) => sections[k]).join('')
    },
  }
}

// ---- CLI -----------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const repoArg = args.indexOf('--repo')
  const templateArg = args.indexOf('--template')
  const result = await build({ repoDir: repoArg !== -1 ? path.resolve(args[repoArg + 1]) : undefined })
  console.log(`Built ${result.commitCount} commits on main. HEAD=${result.head.slice(0, 10)}`)
  console.log(`Packs written to ${path.relative(ROOT, PACKS_DIR)}/`)
  if (templateArg !== -1) {
    const dest = path.resolve(args[templateArg + 1])
    await exportTemplate(result.dir, dest)
    console.log(`Template repo written to ${dest}`)
  }
  if (repoArg !== -1) console.log(`Git repo left at ${result.dir}`)
}

/** Export a GitHub-provisioning template: main's working tree + .git, detour branches stripped. */
async function exportTemplate(repoDir, dest) {
  const prevDir = DIR
  DIR = repoDir
  await checkout('main')
  // Drop teaching-only branches so the template looks like a normal company repo.
  for (const b of ['feature/csv-export', 'feature/tagline', 'docs/engineering-handbook']) {
    try {
      await git.deleteBranch({ ...G(), ref: b })
    } catch {
      /* already gone */
    }
  }
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  for (const [rel, buf] of Object.entries(walkFiles(repoDir))) {
    const abs = path.join(dest, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, buf)
  }
  DIR = prevDir
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
