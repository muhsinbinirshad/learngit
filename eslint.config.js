import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'scripts', 'src/features/lab/editor/monacoCore.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-control-regex': 'off',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['separator', 'tablist'] }],
      'jsx-a11y/no-noninteractive-element-interactions': ['error', { handlers: ['onClick', 'onMouseDown', 'onMouseUp', 'onKeyPress', 'onKeyDown', 'onKeyUp'], alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'], body: ['onError', 'onLoad'], dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'], iframe: ['onError', 'onLoad'], img: ['onError', 'onLoad'] }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
)
