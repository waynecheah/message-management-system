const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'import/no-restricted-paths': ['error', {
        zones: [
          { target: './src/domain',      from: './src/application' },
          { target: './src/domain',      from: './src/infrastructure' },
          { target: './src/domain',      from: './src/interfaces' },
          { target: './src/application', from: './src/infrastructure' },
          { target: './src/application', from: './src/interfaces' },
        ],
      }],
    },
  },
  { ignores: ['node_modules/', 'coverage/'] },
);
