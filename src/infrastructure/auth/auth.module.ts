import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AlsIdentityContext } from '../identity/als-identity-context.ts';
import { IdentityInterceptor } from '../identity/identity.interceptor.ts';
import { IDENTITY_CONTEXT } from '../../domain/ports/identity-context.port.ts';
import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { JwtStrategy } from './jwt.strategy.ts';

@Global()
@Module({
  imports: [PassportModule],
  providers: [
    JwtStrategy,
    AlsIdentityContext,
    { provide: IDENTITY_CONTEXT, useExisting: AlsIdentityContext },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdentityInterceptor },
  ],
  exports: [IDENTITY_CONTEXT, AlsIdentityContext],
})
export class AuthModule {}
