module.exports = {
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
      testTimeout: 30000,
    },
  ],
};
