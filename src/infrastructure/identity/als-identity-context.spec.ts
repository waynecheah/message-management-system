import { MissingIdentityError } from '../../domain/errors.ts';
import { AlsIdentityContext } from './als-identity-context.ts';

describe('AlsIdentityContext', () => {
  const context = new AlsIdentityContext();

  it('throws when no store has been entered', () => {
    expect(() => context.require()).toThrow(MissingIdentityError);
  });

  it('returns the identity inside the store', () => {
    const identity = { tenantId: 't1', senderId: 's1' };
    const seen = context.run(identity, () => context.require());
    expect(seen).toEqual(identity);
  });

  it('does not leak the identity outside the callback', () => {
    context.run({ tenantId: 't1', senderId: 's1' }, () => undefined);
    expect(() => context.require()).toThrow(MissingIdentityError);
  });
});
