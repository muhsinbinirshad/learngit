/**
 * Ledgerly — the fictional fintech the whole course takes place inside. This is the data the
 * "Welcome to Ledgerly" onboarding page renders. Names match the commit authors in the generated
 * history (`scripts/ledgerly/build.mjs`) and the owners in `ledgerly/CODEOWNERS`. All fictional.
 */

export const COMPANY = {
  name: 'Ledgerly',
  tagline: 'Invoicing that does the chasing for you.',
  founded: '2024',
  mission:
    'Ledgerly helps small teams send invoices, track what is owed, and get paid on time — without a spreadsheet. We are a small engineering group that ships every week and keeps `main` always releasable.',
}

export interface TeamMember {
  name: string
  /** Engineering-org handle, as used in CODEOWNERS. */
  handle: string
  role: string
  team: 'Domain' | 'Backend' | 'Frontend' | 'Platform' | 'Engineering'
  focus: string
}

export const TEAM: TeamMember[] = [
  { name: 'Ada Reyes', handle: 'ada', role: 'Staff Engineer', team: 'Backend', focus: 'API and payments; keeps the money model honest.' },
  { name: 'Kofi Mensah', handle: 'kofi', role: 'Senior Engineer', team: 'Domain', focus: 'The shared domain core — money and dates.' },
  { name: 'Mira Shah', handle: 'mira', role: 'Senior Engineer', team: 'Frontend', focus: 'The web app and the invoice views.' },
  { name: 'Luca Rossi', handle: 'luca', role: 'Backend Engineer', team: 'Backend', focus: 'Invoice logic and status transitions.' },
  { name: 'Priya Nair', handle: 'priya', role: 'Full-stack Engineer', team: 'Frontend', focus: 'Web features and tests.' },
  { name: 'Dmitri Volkov', handle: 'dmitri', role: 'Platform Engineer', team: 'Platform', focus: 'CI, Docker, configuration and secrets.' },
  { name: 'Sofia Marín', handle: 'sofia', role: 'Frontend Engineer', team: 'Frontend', focus: 'UI components and styling.' },
  { name: 'Noah Cohen', handle: 'noah', role: 'Engineering Manager', team: 'Engineering', focus: 'Reviews, process, and the release train.' },
]

export interface ArchPackage {
  id: string
  path: string
  title: string
  description: string
  dependsOn: string[]
}

export const ARCHITECTURE: ArchPackage[] = [
  { id: 'shared', path: 'packages/shared', title: 'shared', description: 'Domain core: money in integer minor units, ISO dates, invoice types. No framework.', dependsOn: [] },
  { id: 'api', path: 'api', title: 'api', description: 'HTTP service: invoice totals, status transitions, configuration.', dependsOn: ['shared'] },
  { id: 'web', path: 'web', title: 'web', description: 'React front end: invoice list and forms.', dependsOn: ['shared'] },
]

export const BRANCHING: { title: string; detail: string }[] = [
  { title: '`main` is always releasable', detail: 'Protected. No direct pushes — every change lands through a reviewed pull request with green CI.' },
  { title: 'Branch per change', detail: 'Branch from `main` as `feature/…`, `fix/…`, or `chore/…`. Keep it small and short-lived.' },
  { title: 'Conventional commits', detail: 'Messages read `type(scope): subject` — e.g. `feat(api): compute tax per line item`.' },
  { title: 'Linear history', detail: 'Rebase your branch on `main` rather than merging `main` into it. We squash or rebase to keep history readable.' },
  { title: 'Release branches', detail: 'Hardening happens on `release/x.y`. Only fixes are cherry-picked there; features wait for the next line.' },
]

export interface OwnershipRule {
  pattern: string
  owner: string
  note: string
}

/** Mirrors ledgerly/CODEOWNERS. */
export const OWNERSHIP: OwnershipRule[] = [
  { pattern: '*', owner: '@ledgerly-eng/maintainers', note: 'Default owners for anything not matched below.' },
  { pattern: '/packages/shared/', owner: '@ledgerly-eng/domain', note: 'Money and date logic — the most load-bearing code.' },
  { pattern: '/api/', owner: '@ledgerly-eng/backend', note: 'The service and invoice logic.' },
  { pattern: '/web/', owner: '@ledgerly-eng/frontend', note: 'The React app.' },
  { pattern: '/api/src/config.ts', owner: '@ledgerly-eng/platform', note: 'Configuration and secrets — platform reviews every change.' },
  { pattern: '/.github/', owner: '@ledgerly-eng/platform', note: 'CI and repo policy.' },
]

export const RELEASES: { tag: string; date: string; summary: string }[] = [
  { tag: 'v0.1.0', date: '2024-11', summary: 'Project scaffold: money core, API skeleton, web shell.' },
  { tag: 'v1.0.0', date: '2025-03', summary: 'First stable release: invoice totals, line items, multi-currency.' },
  { tag: 'v1.2.0', date: '2025-06', summary: 'Invoice status transitions (draft → sent → paid, void).' },
  { tag: 'v1.4.0', date: '2025-09', summary: 'Overdue badge on sent invoices past their due date.' },
  { tag: 'v1.4.2', date: '2025-09', summary: 'Fix a rounding bug in tax calculation.' },
]
