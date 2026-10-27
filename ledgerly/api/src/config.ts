/**
 * Runtime configuration. Secrets come from the environment, never from source control.
 * See `.env.example` for the variables this service reads, and SECURITY.md for how we handle keys.
 */

export interface Config {
  port: number
  databaseUrl: string
  /** Payment provider secret key. Injected from the environment at boot. */
  paymentApiKey: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const paymentApiKey = env.PAYMENT_API_KEY ?? ''
  if (!paymentApiKey && env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_API_KEY is required in production (set it in the environment, not in code)')
  }
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://localhost:5432/ledgerly',
    paymentApiKey,
  }
}
