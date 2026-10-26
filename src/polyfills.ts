// isomorphic-git relies on the Node `Buffer` global; browsers do not have one.
import { Buffer } from 'buffer'

const g = globalThis as unknown as { Buffer?: typeof Buffer }
if (!g.Buffer) g.Buffer = Buffer
