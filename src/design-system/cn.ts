/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | number | bigint | boolean | null | undefined>): string {
  return parts.filter((p) => typeof p === 'string' && p).join(' ')
}
