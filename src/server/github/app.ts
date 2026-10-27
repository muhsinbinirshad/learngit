import { createSign } from 'node:crypto'

/**
 * GitHub App (not an OAuth App, not personal access tokens). Each permission is least-privilege and
 * justified; this table is the source for the manifest and the security doc. "read" never implies
 * write, and we request Administration only to set branch protection on lab repos we create.
 */
export const APP_PERMISSIONS: { permission: string; access: 'read' | 'write'; why: string }[] = [
  { permission: 'contents', access: 'write', why: 'Provision lab repos from the template and let bots push commits (e.g. a conflicting commit to main).' },
  { permission: 'pull_requests', access: 'write', why: 'Bots open, review and comment on pull requests; validation reads PR state.' },
  { permission: 'issues', access: 'write', why: 'Seed lab issues and let bots comment; validation checks issue state and PR references.' },
  { permission: 'checks', access: 'read', why: 'Read CI check-run results for the "checkRunPassed" validation; we never write checks.' },
  { permission: 'actions', access: 'read', why: 'Read workflow run status for labs that gate on CI. Read-only.' },
  { permission: 'administration', access: 'write', why: 'Set branch protection on lab repos we create. Scoped to the classroom org only.' },
  { permission: 'members', access: 'write', why: 'Add the learner as a write collaborator on their lab repo. We never touch personal repos.' },
  { permission: 'metadata', access: 'read', why: 'Mandatory baseline read access to repo metadata.' },
]

/** Webhook events the App subscribes to (drives bots and validation). */
export const APP_EVENTS = ['push', 'pull_request', 'pull_request_review', 'issues', 'issue_comment', 'check_run', 'release']

/** GitHub App manifest (used for one-click App creation). Secrets are filled by GitHub at creation. */
export function appManifest(baseUrl: string) {
  return {
    name: 'Commit Lab Classroom',
    url: baseUrl,
    hook_attributes: { url: `${baseUrl}/webhooks/github`, active: true },
    redirect_url: `${baseUrl}/auth/github/callback`,
    public: false,
    default_permissions: Object.fromEntries(APP_PERMISSIONS.map((p) => [p.permission, p.access])),
    default_events: APP_EVENTS,
  }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Mint a short-lived App JWT (RS256) used to authenticate as the App and then fetch an installation
 * token. Valid for 10 minutes; `iat` is backdated 60s for clock skew, per GitHub's guidance.
 */
export function appJwt(privateKeyPem: string, appId: string, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 600, iss: appId }))
  const signingInput = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem)
  return `${signingInput}.${b64url(signature)}`
}
