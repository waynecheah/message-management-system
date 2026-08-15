module.exports = {
  // Root level, not per-project: jest-circus takes the per-test deadline from
  // the *global* config, so a `testTimeout` inside a `projects` entry is parsed
  // and then ignored, silently leaving integration tests on the 5s default.
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
      testEnvironment: '<rootDir>/no-temporal-environment.cjs',
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
      maxWorkers: 1,
      testEnvironment: '<rootDir>/no-temporal-environment.cjs',
    },
  ],
};
