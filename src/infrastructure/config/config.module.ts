import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvConfig, validateEnv } from './env.config.ts';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
  providers: [{ provide: EnvConfig, useFactory: () => validateEnv(process.env) }],
  exports: [EnvConfig],
})
export class AppConfigModule {}
