/**
 * Server configuration. Every secret comes from the environment — never from source control.
 * In production these are injected by the host's secret manager; in tests they are passed explicitly.
 */
export interface ServerConfig {
  /** GitHub App id. */
  githubAppId: string
  /** GitHub App private key (PEM) used to mint app JWTs. Server-only. */
  githubAppPrivateKey: string
  /** OAuth client id/secret for "Sign in with GitHub" (the App's user-authorization flow). */
  githubClientId: string
  githubClientSecret: string
  /** Secret configured on the GitHub App webhook; used to verify X-Hub-Signature-256. */
  githubWebhookSecret: string
  /** 32-byte key (hex) for AES-256-GCM encryption of stored tokens. */
  tokenEncryptionKey: string
  /** The instructor-controlled classroom organization lab repos are created in. */
  classroomOrg: string
  /** The Ledgerly template repo (owner/name) new lab repos are created from. */
  templateOwner: string
  templateRepo: string
  /** Base URL of this backend, used to build the OAuth redirect URI. */
  baseUrl: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const req = (k: string): string => {
    const v = env[k]
    if (!v) throw new Error(`missing required environment variable: ${k}`)
    return v
  }
  return {
    githubAppId: req('GITHUB_APP_ID'),
    githubAppPrivateKey: req('GITHUB_APP_PRIVATE_KEY'),
    githubClientId: req('GITHUB_CLIENT_ID'),
    githubClientSecret: req('GITHUB_CLIENT_SECRET'),
    githubWebhookSecret: req('GITHUB_WEBHOOK_SECRET'),
    tokenEncryptionKey: req('TOKEN_ENCRYPTION_KEY'),
    classroomOrg: env.CLASSROOM_ORG ?? 'ledgerly-labs',
    templateOwner: env.TEMPLATE_OWNER ?? 'ledgerly-labs',
    templateRepo: env.TEMPLATE_REPO ?? 'ledgerly-template',
    baseUrl: env.BASE_URL ?? 'http://localhost:8787',
  }
}
