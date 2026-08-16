module.exports = {
  // Root level, not per-project: jest-circus takes the per-test deadline from
  // the *global* config, so a `testTimeout` inside a `projects` entry is parsed
  // and then ignored, silently leaving integration tests on the 5s default.
  testTimeout: 30000,
  // Root level for the same reason: jest reads `maxWorkers` from the global
  // config, so a `projects` entry's copy is ignored and the integration specs
  // fan out across workers that share one Kafka topic and trip over each other.
  maxWorkers: 1,
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
      testEnvironment: '<rootDir>/no-temporal-environment.cjs',
    },
  ],
};
