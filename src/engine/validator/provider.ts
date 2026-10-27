import type { LabMode, Objective } from '../scenario/types'
import { evaluateObjectives, type ObjectiveResult, type ValidationContext } from './index'

/**
 * A check provider evaluates a lab's objectives and reports which are met. It hides *where* the
 * repository state lives, so the same lab objectives can be validated against the in-browser engine
 * (sandbox) or against live GitHub state (Real mode). The UI calls `evaluate` after each change
 * (sandbox) or when the learner clicks "Check my work" / a webhook fires (github).
 */
export interface CheckProvider {
  readonly mode: LabMode
  evaluate(objectives: Objective[]): Promise<ObjectiveResult[]>
}

/** Validates against the in-browser Git engine. The provider for every sandbox lab. */
export class SandboxProvider implements CheckProvider {
  readonly mode = 'sandbox' as const
  constructor(private readonly ctx: ValidationContext) {}
  evaluate(objectives: Objective[]): Promise<ObjectiveResult[]> {
    return evaluateObjectives(objectives, this.ctx)
  }
}

/** Identifies the provisioned lab repo the GitHubProvider will read. Tokens never reach the browser. */
export interface GitHubProviderConfig {
  owner: string
  repo: string
  /** Resolved clone/browse URL shown to the learner. */
  repoUrl: string
}

/**
 * Validates Real-mode labs against live GitHub state. The implementation lands in Phase 5 with the
 * backend and the GitHub App; the interface exists now so Phase 3's workspace can be built against
 * it. Calling `evaluate` before then fails loudly rather than silently passing.
 */
export class GitHubProvider implements CheckProvider {
  readonly mode = 'github' as const
  constructor(readonly config: GitHubProviderConfig) {}
  evaluate(): Promise<ObjectiveResult[]> {
    return Promise.reject(
      new Error(
        'Real-mode (GitHub) validation arrives in Phase 5: the backend and GitHub App evaluate checks against live repository state via webhooks and the API. Sandbox labs work today.',
      ),
    )
  }
}

/** Build the provider for a lab's mode. */
export function createCheckProvider(mode: LabMode, opts: { ctx?: ValidationContext; github?: GitHubProviderConfig }): CheckProvider {
  if (mode === 'github') {
    if (!opts.github) throw new Error('createCheckProvider: github mode needs a GitHubProviderConfig')
    return new GitHubProvider(opts.github)
  }
  if (!opts.ctx) throw new Error('createCheckProvider: sandbox mode needs a ValidationContext')
  return new SandboxProvider(opts.ctx)
}
