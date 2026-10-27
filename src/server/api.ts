import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { ServerConfig } from './config'
import type { LabRunner } from './runner'

/**
 * Thin HTTP surface over the LabRunner. All domain logic lives in the runner and its modules (which
 * are unit-tested directly); this file only parses requests and shapes responses. The webhook route
 * reads the raw body so the signature can be verified over the exact bytes GitHub sent.
 */
function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function headerStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function createHttpServer(runner: LabRunner, config: ServerConfig) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', config.baseUrl)
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }

      if (req.method === 'GET' && url.pathname === '/healthz') return send(200, { status: 'ok' })

      if (req.method === 'GET' && url.pathname === '/auth/github/login') {
        const { url: authUrl, state } = runner.startSignIn()
        res.writeHead(302, { location: authUrl, 'set-cookie': `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/` })
        return res.end()
      }

      if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
        const code = url.searchParams.get('code') ?? ''
        const state = url.searchParams.get('state') ?? ''
        const user = await runner.completeSignIn({ code, state })
        // A real deployment sets a server-side session cookie here; the GitHub token never leaves the server.
        return send(200, { user: { id: user.id, login: user.githubLogin } })
      }

      if (req.method === 'POST' && url.pathname === '/webhooks/github') {
        const rawBody = await readRaw(req)
        const headers = {
          'x-hub-signature-256': headerStr(req.headers['x-hub-signature-256']),
          'x-github-event': headerStr(req.headers['x-github-event']),
          'x-github-delivery': headerStr(req.headers['x-github-delivery']),
        }
        const result = await runner.handleWebhook({ headers, rawBody })
        return send(result.status === 'invalid_signature' ? 401 : 200, result)
      }

      const checkMatch = /^\/api\/attempts\/([^/]+)\/check$/.exec(url.pathname)
      if (req.method === 'POST' && checkMatch) {
        const attempt = await runner.checkWork(checkMatch[1]!)
        return send(200, { status: attempt.status, objectives: attempt.objectives })
      }

      // Backend-synced progress + badges (replaces local-only storage on the client).
      const badgesMatch = /^\/api\/users\/([^/]+)\/badges$/.exec(url.pathname)
      if (req.method === 'GET' && badgesMatch) {
        return send(200, { badges: await runner.listBadges(badgesMatch[1]!) })
      }
      const progressMatch = /^\/api\/users\/([^/]+)\/progress$/.exec(url.pathname)
      if (req.method === 'GET' && progressMatch) {
        return send(200, { progress: await runner.getProgress(progressMatch[1]!) })
      }

      send(404, { error: 'not found' })
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'internal error' }))
    }
  })
}
