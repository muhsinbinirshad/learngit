import LightningFS from '@isomorphic-git/lightning-fs'
import type { FsClient } from './types'

/** IndexedDB-backed filesystem. One store per lab so labs never leak into each other. */
export function createBrowserFs(name: string, wipe = false): FsClient {
  const fs = new LightningFS(name, { wipe })
  return { promises: fs.promises as unknown as FsClient['promises'] }
}

export async function deleteBrowserFs(name: string): Promise<void> {
  // lightning-fs stores data in an IndexedDB database named after the fs.
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve()
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}
