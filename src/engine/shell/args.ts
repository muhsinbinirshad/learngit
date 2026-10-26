/**
 * Small option parser for git-like CLIs.
 * spec.flags: boolean options; spec.values: options that take a value (`-m msg`, `-m=msg`, `--message=msg`, `-mmsg`).
 */
export interface ArgSpec {
  flags?: Record<string, string> // '-a' -> 'all'
  values?: Record<string, string> // '-m' -> 'message'
  /** Values that may repeat and accumulate into an array. */
  multi?: string[]
  /** Stop parsing options after the first positional (e.g. `git stash push`). */
  stopAtPositional?: boolean
}

export interface ParsedArgs {
  flags: Set<string>
  values: Record<string, string>
  multi: Record<string, string[]>
  positional: string[]
  /** Arguments after `--` */
  afterDashDash: string[]
  unknown: string[]
}

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const out: ParsedArgs = { flags: new Set(), values: {}, multi: {}, positional: [], afterDashDash: [], unknown: [] }
  const flags = spec.flags ?? {}
  const values = spec.values ?? {}
  const multi = new Set(spec.multi ?? [])
  const setValue = (name: string, v: string) => {
    if (multi.has(name)) (out.multi[name] ??= []).push(v)
    else out.values[name] = v
  }
  let i = 0
  let sawPositional = false
  while (i < argv.length) {
    const a = argv[i]!
    if (a === '--') {
      out.afterDashDash = argv.slice(i + 1)
      break
    }
    if (sawPositional && spec.stopAtPositional) {
      out.positional.push(a)
      i++
      continue
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=')
      const key = eq >= 0 ? a.slice(0, eq) : a
      if (key in flags) {
        out.flags.add(flags[key]!)
        i++
        continue
      }
      if (key in values) {
        if (eq >= 0) setValue(values[key]!, a.slice(eq + 1))
        else {
          const v = argv[i + 1]
          if (v === undefined) throw new Error(`option '${key}' requires a value`)
          setValue(values[key]!, v)
          i++
        }
        i++
        continue
      }
      out.unknown.push(a)
      i++
      continue
    }
    if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      // short options, possibly combined: -am "msg"
      let j = 1
      let consumedNext = false
      while (j < a.length) {
        const key = '-' + a[j]!
        if (key in flags) {
          out.flags.add(flags[key]!)
          j++
          continue
        }
        if (key in values) {
          const rest = a.slice(j + 1)
          if (rest) {
            setValue(values[key]!, rest.startsWith('=') ? rest.slice(1) : rest)
          } else {
            const v = argv[i + 1]
            if (v === undefined) throw new Error(`switch '${a[j]}' requires a value`)
            setValue(values[key]!, v)
            consumedNext = true
          }
          j = a.length
          continue
        }
        out.unknown.push(key)
        j++
      }
      i += consumedNext ? 2 : 1
      continue
    }
    if (/^-\d+$/.test(a)) {
      // -3 style count
      out.values['count'] = a.slice(1)
      i++
      continue
    }
    out.positional.push(a)
    sawPositional = true
    i++
  }
  return out
}
