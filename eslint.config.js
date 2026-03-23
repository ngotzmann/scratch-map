import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'public/js/**'],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process:     'readonly',
        console:     'readonly',
        global:      'writable',
        setTimeout:  'readonly',
        Buffer:      'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef':       'error',
    },
  },
];
