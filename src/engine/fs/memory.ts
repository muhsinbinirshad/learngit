import { createFsFromVolume, Volume } from 'memfs'
import type { FsClient } from './types'

/** In-memory filesystem for tests and for ephemeral sessions. */
export function createMemoryFs(): FsClient {
  const vol = new Volume()
  const fs = createFsFromVolume(vol)
  return { promises: fs.promises as unknown as FsClient['promises'] }
}
