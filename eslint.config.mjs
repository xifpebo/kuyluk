// Dependency-free ESLint flat config (ESLint 9+). Run: npx eslint .
const common = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-imports': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-console': 'warn',
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error'
};

const nodeGlobals = Object.fromEntries(
  ['require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer', 'console', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'setImmediate', 'URL', 'URLSearchParams', 'fetch', 'AbortController', 'TextEncoder',
    'TextDecoder', 'structuredClone', 'Intl', 'queueMicrotask', 'Response', 'Headers', 'Blob', 'FormData', 'AbortSignal'].map((name) => [name, 'readonly'])
);

const browserGlobals = Object.fromEntries(
  ['window', 'document', 'navigator', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch',
    'URL', 'URLSearchParams', 'AbortController', 'CustomEvent', 'HashChangeEvent', 'Event', 'Element', 'HTMLElement',
    'HTMLDetailsElement', 'RadioNodeList', 'CSS', 'Blob', 'File', 'FormData', 'Intl', 'requestAnimationFrame',
    'IntersectionObserver', 'history', 'location', 'performance'].map((name) => [name, 'readonly'])
);

export default [
  { ignores: ['node_modules/**', 'uploads/**', 'coverage/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: nodeGlobals },
    rules: common
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browserGlobals },
    rules: common
  }
];
