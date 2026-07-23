import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**', 'release/**', 'canvas/**', 'data/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'eqeqeq': ['error', 'always'],
      'no-constant-binary-expression': 'error',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-useless-catch': 'error',
    },
  },
];
