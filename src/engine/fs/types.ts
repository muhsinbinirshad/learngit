/** Minimal promise-based filesystem contract shared by lightning-fs (browser) and memfs (tests). */
export interface FsStat {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  mode: number
  size: number
  mtimeMs: number
  ctimeMs?: number
  ino?: number
  uid?: number
  gid?: number
  dev?: number
}

export interface FsPromises {
  readFile(path: string, options?: { encoding?: 'utf8' } | 'utf8'): Promise<Uint8Array | string>
  writeFile(path: string, data: Uint8Array | string, options?: { encoding?: 'utf8'; mode?: number } | 'utf8'): Promise<void>
  unlink(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  mkdir(path: string, options?: { mode?: number; recursive?: boolean }): Promise<void | string>
  rmdir(path: string): Promise<void>
  stat(path: string): Promise<FsStat>
  lstat(path: string): Promise<FsStat>
  readlink(path: string): Promise<string>
  symlink(target: string, path: string): Promise<void>
  rename?(oldPath: string, newPath: string): Promise<void>
}

export interface FsClient {
  promises: FsPromises
}
