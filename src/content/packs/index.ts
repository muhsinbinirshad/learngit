import type { SeedPack } from '@/engine/scenario/pack'

/**
 * Ledgerly seed packs — repository snapshots produced by `scripts/ledgerly/build.mjs`. They are
 * loaded lazily (dynamic import) so their JSON never bloats the main bundle: each pack becomes its
 * own chunk, fetched only when a lab that uses it starts.
 *
 * A lab references a pack by name in `seed.pack`; `resolveLabPacks` in the content index swaps the
 * name for the loaded SeedPack before the scenario runner seeds the repo.
 */
const loaders = {
  't1-first-day': () => import('./t1-first-day.json'),
  't2-merge-conflict': () => import('./t2-merge-conflict.json'),
  't4-rebase': () => import('./t4-rebase.json'),
  't5-bisect': () => import('./t5-bisect.json'),
  't6-secret': () => import('./t6-secret.json'),
  'ledgerly-main': () => import('./ledgerly-main.json'),
} satisfies Record<string, () => Promise<{ default: unknown }>>

export type PackName = keyof typeof loaders

export const packNames = Object.keys(loaders) as PackName[]

export function isPackName(name: string): name is PackName {
  return name in loaders
}

export async function loadPack(name: PackName): Promise<SeedPack> {
  const mod = await loaders[name]()
  return mod.default as SeedPack
}
