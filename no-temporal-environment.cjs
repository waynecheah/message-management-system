// This Node build exposes a native `Temporal` global whose `Now` property is
// non-configurable. jest.useFakeTimers() (via @sinonjs/fake-timers) captures
// the global's shape once, at environment construction, and always tries to
// patch Temporal.Now when it is present — a patch that is broken on such
// builds ("Cannot redefine property: Now"), even for tests that never touch
// Temporal. A setupFiles hook runs too late, after jest-environment-node has
// already captured this global's property list, so Temporal has to be
// shadowed here, before jest-environment-node is required, so it is absent
// from the very first snapshot the fake-timers machinery takes.
Object.defineProperty(globalThis, 'Temporal', {
  value: undefined,
  configurable: true,
  writable: true,
  enumerable: false,
});

const { TestEnvironment } = require('jest-environment-node');

module.exports = class NoTemporalEnvironment extends TestEnvironment {};
