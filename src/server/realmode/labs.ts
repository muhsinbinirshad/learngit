import type { GhObjective } from '../validator/githubChecks'

/**
 * Real-mode labs run on real GitHub, on the learner's own machine or a Codespace. Each carries the
 * Mission-panel content (beginner-friendly setup steps + copyable commands with a {{repoUrl}}
 * placeholder) and, where it can be validated, GitHub objectives for the GitHubProvider.
 *
 * The onboarding labs come first: they get the learner a working Git, an identity, auth, and a way
 * to run commands — explicitly, as part of the curriculum, not a hidden prerequisite.
 */
export interface RealModeLab {
  id: string
  title: string
  summary: string
  /** GitHub's minimum age to hold an account; surfaced during onboarding. */
  requiresGithubAccount: boolean
  setup: string[]
  commands: string[]
  objectives: GhObjective[]
}

export const ONBOARDING_LABS: RealModeLab[] = [
  {
    id: 'ro-install-git',
    title: 'Install and check Git',
    summary: 'Get Git onto your computer and confirm it works. If you would rather not install anything, you can use a Codespace in the browser instead (next lab).',
    requiresGithubAccount: false,
    setup: [
      'On Windows, install **Git for Windows** from git-scm.com. On macOS, run `xcode-select --install` or install from git-scm.com. On Linux, use your package manager (e.g. `sudo apt install git`).',
      'Open a terminal (Terminal on macOS/Linux, Git Bash on Windows).',
      'Run the command below. If you see a version number, Git is installed.',
    ],
    commands: ['git --version'],
    objectives: [],
  },
  {
    id: 'ro-identity',
    title: 'Tell Git who you are',
    summary: 'Git stamps every commit with a name and email. Set yours once, globally, so your work is attributed to you.',
    requiresGithubAccount: false,
    setup: [
      'Use the same email you use for GitHub.',
      'Run both commands below, replacing the name and email with your own.',
      'Check it with `git config --global --list`.',
    ],
    commands: ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"'],
    objectives: [],
  },
  {
    id: 'ro-auth',
    title: 'Connect to GitHub securely',
    summary: 'Pick one way to prove to GitHub that pushes are really you: an SSH key, or HTTPS with the GitHub CLI. Either is fine — SSH is the most common at work.',
    requiresGithubAccount: true,
    setup: [
      'GitHub requires a free account (you must be at least 13). Create one if you have not.',
      '**SSH (recommended):** generate a key with the command below, then add the public key (`~/.ssh/id_ed25519.pub`) to GitHub → Settings → SSH and GPG keys.',
      '**Or HTTPS:** install the GitHub CLI and run `gh auth login`, which stores a credential for you.',
      'Test your connection with the last command — you should see a "successfully authenticated" message.',
    ],
    commands: ['ssh-keygen -t ed25519 -C "you@example.com"', 'gh auth login', 'ssh -T git@github.com'],
    objectives: [],
  },
  {
    id: 'ro-codespaces',
    title: 'No local setup? Use a Codespace',
    summary: 'A Codespace is a full development environment in your browser, with Git already installed and signed in. Use it if you cannot or prefer not to install anything locally.',
    requiresGithubAccount: true,
    setup: [
      'Open your lab repository (link above).',
      'Click the green **Code** button → **Codespaces** → **Create codespace on main**.',
      'Wait for it to load. You now have a terminal and editor in the browser, already authenticated to GitHub.',
    ],
    commands: ['git status'],
    objectives: [],
  },
  {
    id: 't3-first-pr',
    title: 'Open your first pull request',
    summary: 'Your first real change at Ledgerly: fix the typo in the README on a branch, open a pull request that closes the ticket, get it reviewed, and address the feedback.',
    requiresGithubAccount: true,
    setup: [
      'Clone your lab repository (command below) and open it.',
      'Create a branch: `git switch -c fix/readme-typo`.',
      'Fix the typo in `README.md`, commit, and push your branch.',
      'Open a pull request into `main`. In the description, write `Closes #1` so it links the ticket.',
      'A teammate (Mira) will review it. Address her comment, then click **Check my work**.',
    ],
    commands: ['git clone {{repoUrl}}', 'git switch -c fix/readme-typo', 'git push -u origin fix/readme-typo'],
    objectives: [
      { id: 'branch', title: 'Create a fix/ branch', check: { type: 'branchExists', branch: 'fix/readme-typo' } },
      { id: 'commit', title: 'Commit the fix', check: { type: 'commitOnBranch', branch: 'fix/readme-typo', messagePattern: '.' } },
      { id: 'pr-open', title: 'Open a pull request', check: { type: 'prOpen', head: 'fix/readme-typo' } },
      { id: 'pr-issue', title: 'Reference the ticket', check: { type: 'prReferencesIssue', head: 'fix/readme-typo', issue: 1 } },
      { id: 'pr-approved', title: 'Get an approving review', check: { type: 'prHasApprovedReview', head: 'fix/readme-typo' } },
    ],
  },
]

/** Track-6 Real-mode labs validated against live GitHub state. */
export const TEAM_LABS: RealModeLab[] = [
  {
    id: 't6-release',
    title: 'Cut a release with a tag and notes',
    summary: 'Mark main as v1.5.0 with an annotated tag, push it, and publish a GitHub release with notes.',
    requiresGithubAccount: true,
    setup: [
      'Create an annotated tag: `git tag -a v1.5.0 -m "Ledgerly 1.5.0"`.',
      'Push the tag: `git push origin v1.5.0`.',
      'Publish a GitHub release for v1.5.0 with a title and notes (Releases → Draft a new release, or `gh release create`).',
    ],
    commands: ['git tag -a v1.5.0 -m "Ledgerly 1.5.0"', 'git push origin v1.5.0', 'gh release create v1.5.0 --notes "Invoice PDF export and tax rounding fix."'],
    objectives: [
      { id: 'tag', title: 'Create and push the v1.5.0 tag', check: { type: 'tagExists', tag: 'v1.5.0' } },
      { id: 'release', title: 'Publish a release for v1.5.0', check: { type: 'releaseExists', tag: 'v1.5.0' } },
    ],
  },
  {
    id: 't6-branch-protection',
    title: 'Land a change under branch protection and green CI',
    summary: 'main is protected: a pull request needs an approving review and a passing CI check before it can merge. Open a PR, get CI green, get it approved, and merge.',
    requiresGithubAccount: true,
    setup: [
      'Branch from main (e.g. `fix/ci`), make your change, and open a pull request.',
      'CI runs automatically. If the check is red, read the logs, fix the cause, and push again — do not try to bypass protection.',
      'Request review; once a code owner approves and CI is green, merge the pull request.',
    ],
    commands: ['git switch -c fix/ci', 'git push -u origin fix/ci'],
    objectives: [
      { id: 'protected', title: 'main is protected (reviews required)', check: { type: 'branchProtectionEnabled', branch: 'main', minApprovals: 1 } },
      { id: 'ci-green', title: 'CI is passing on your branch', check: { type: 'checkRunPassed', ref: 'refs/heads/fix/ci', name: 'CI' } },
      { id: 'approved', title: 'The pull request is approved', check: { type: 'prHasApprovedReview', head: 'fix/ci' } },
      { id: 'merged', title: 'The pull request is merged', check: { type: 'prMerged', head: 'fix/ci' } },
    ],
  },
  {
    id: 't6-codeowners',
    title: 'Get the right review via CODEOWNERS',
    summary: 'A CODEOWNERS file routes reviews: a change to the pricing module needs the backend owners’ approval. Open a PR touching pricing and get it approved and merged.',
    requiresGithubAccount: true,
    setup: [
      'Branch from main (e.g. `feat/pricing`) and change a file under the path CODEOWNERS routes to the backend team.',
      'Open a pull request. GitHub automatically requests review from the matching code owners.',
      'Once an owner approves, merge.',
    ],
    commands: ['git switch -c feat/pricing', 'git push -u origin feat/pricing'],
    objectives: [
      { id: 'approved', title: 'A code owner approved the pull request', check: { type: 'prHasApprovedReview', head: 'feat/pricing' } },
      { id: 'merged', title: 'The pull request is merged', check: { type: 'prMerged', head: 'feat/pricing' } },
    ],
  },
]

const ALL_REAL_MODE_LABS = [...ONBOARDING_LABS, ...TEAM_LABS]

export function getRealModeLab(id: string): RealModeLab | undefined {
  return ALL_REAL_MODE_LABS.find((l) => l.id === id)
}
