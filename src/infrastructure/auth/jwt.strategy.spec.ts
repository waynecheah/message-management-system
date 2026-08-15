import { UnauthorizedException } from '@nestjs/common';
import { validateClaims } from './jwt.strategy.ts';

describe('validateClaims', () => {
  it('maps tid and sub to the identity', () => {
    expect(validateClaims({ tid: 't1', sub: 's1' })).toEqual({ tenantId: 't1', senderId: 's1' });
  });

  it('rejects a token with no tid', () => {
    expect(() => validateClaims({ sub: 's1' })).toThrow(UnauthorizedException);
  });

  it('rejects a token with no sub', () => {
    expect(() => validateClaims({ tid: 't1' })).toThrow(UnauthorizedException);
  });
});
