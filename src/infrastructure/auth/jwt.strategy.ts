import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Identity } from '../../domain/ports/identity-context.port.ts';
import { EnvConfig } from '../config/env.config.ts';

export function validateClaims(payload: { tid?: string; sub?: string }): Identity {
  if (!payload.tid || !payload.sub) throw new UnauthorizedException();
  return { tenantId: payload.tid, senderId: payload.sub };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: EnvConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.JWT_PUBLIC_KEY,
      algorithms: ['ES256'], // pinned — never read from the token's alg header
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      ignoreExpiration: false,
    });
  }

  validate(payload: { tid?: string; sub?: string }): Identity {
    return validateClaims(payload);
  }
}
