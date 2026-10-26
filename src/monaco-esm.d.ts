// Side-effect modules inside monaco-editor/esm have no type declarations.
declare module 'monaco-esm/editor/editor.api.js' {
  export * from 'monaco-editor'
}
declare module 'monaco-esm/*'
