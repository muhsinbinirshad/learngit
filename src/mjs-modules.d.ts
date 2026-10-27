// Node build scripts (e.g. scripts/ledgerly/build.mjs) are plain JS with no type declarations.
// Tests import them and cast to a local type; this makes the untyped module resolvable.
declare module '*.mjs' {
  const value: unknown
  export default value
}
