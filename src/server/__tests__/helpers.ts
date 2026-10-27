import { createHmac } from 'node:crypto'
import type { ServerConfig } from '../config'

export function testConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    githubAppId: '123456',
    githubAppPrivateKey: 'unused-in-fake',
    githubClientId: 'client-id',
    githubClientSecret: 'client-secret',
    githubWebhookSecret: 'webhook-secret',
    tokenEncryptionKey: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    classroomOrg: 'ledgerly-labs',
    templateOwner: 'ledgerly-labs',
    templateRepo: 'ledgerly-template',
    baseUrl: 'https://commitlab.test',
    ...over,
  }
}

export function signWebhook(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}
