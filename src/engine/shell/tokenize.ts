/** Tokenize a shell line with POSIX-ish quoting, redirections and `&&` / `;` / `||` separators. */
export type Token = { kind: 'word'; value: string; quoted: boolean } | { kind: 'op'; value: '>' | '>>' | '&&' | '||' | ';' | '|' }

export class ShellSyntaxError extends Error {}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let cur = ''
  let inWord = false
  let quoted = false
  const push = () => {
    if (inWord) tokens.push({ kind: 'word', value: cur, quoted })
    cur = ''
    inWord = false
    quoted = false
  }
  while (i < input.length) {
    const ch = input[i]!
    if (ch === '#' && !inWord) break
    if (ch === "'") {
      const end = input.indexOf("'", i + 1)
      if (end < 0) throw new ShellSyntaxError('unterminated single quote')
      cur += input.slice(i + 1, end)
      inWord = true
      quoted = true
      i = end + 1
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let s = ''
      while (j < input.length && input[j] !== '"') {
        if (input[j] === '\\' && j + 1 < input.length && '"\\$`\n'.includes(input[j + 1]!)) {
          s += input[j + 1]
          j += 2
          continue
        }
        s += input[j]
        j++
      }
      if (j >= input.length) throw new ShellSyntaxError('unterminated double quote')
      cur += s
      inWord = true
      quoted = true
      i = j + 1
      continue
    }
    if (ch === '\\') {
      if (i + 1 < input.length) {
        cur += input[i + 1]
        inWord = true
        i += 2
        continue
      }
      i++
      continue
    }
    if (ch === ' ' || ch === '\t') {
      push()
      i++
      continue
    }
    if (ch === '>') {
      push()
      if (input[i + 1] === '>') {
        tokens.push({ kind: 'op', value: '>>' })
        i += 2
      } else {
        tokens.push({ kind: 'op', value: '>' })
        i++
      }
      continue
    }
    if (ch === '&' && input[i + 1] === '&') {
      push()
      tokens.push({ kind: 'op', value: '&&' })
      i += 2
      continue
    }
    if (ch === '|') {
      push()
      if (input[i + 1] === '|') {
        tokens.push({ kind: 'op', value: '||' })
        i += 2
      } else {
        tokens.push({ kind: 'op', value: '|' })
        i++
      }
      continue
    }
    if (ch === ';') {
      push()
      tokens.push({ kind: 'op', value: ';' })
      i++
      continue
    }
    cur += ch
    inWord = true
    i++
  }
  push()
  return tokens
}

export interface SimpleCommand {
  argv: string[]
  /** Words that were quoted (same index as argv) - used to skip glob expansion. */
  quoted: boolean[]
  redirect?: { path: string; append: boolean }
}

export interface Pipeline {
  commands: SimpleCommand[] // joined by '|'
  /** How this pipeline is chained to the next one. */
  next?: '&&' | '||' | ';'
}

/** Group tokens into a list of pipelines joined by control operators. */
export function parse(input: string): Pipeline[] {
  const tokens = tokenize(input)
  const pipelines: Pipeline[] = []
  let current: Pipeline = { commands: [] }
  let cmd: SimpleCommand = { argv: [], quoted: [] }
  let i = 0
  const finishCmd = () => {
    if (cmd.argv.length || cmd.redirect) current.commands.push(cmd)
    cmd = { argv: [], quoted: [] }
  }
  while (i < tokens.length) {
    const t = tokens[i]!
    if (t.kind === 'word') {
      cmd.argv.push(t.value)
      cmd.quoted.push(t.quoted)
      i++
      continue
    }
    if (t.value === '>' || t.value === '>>') {
      const target = tokens[i + 1]
      if (!target || target.kind !== 'word') throw new ShellSyntaxError("syntax error near unexpected token `newline'")
      cmd.redirect = { path: target.value, append: t.value === '>>' }
      i += 2
      continue
    }
    if (t.value === '|') {
      finishCmd()
      i++
      continue
    }
    finishCmd()
    current.next = t.value
    pipelines.push(current)
    current = { commands: [] }
    i++
  }
  finishCmd()
  if (current.commands.length) pipelines.push(current)
  return pipelines
}
