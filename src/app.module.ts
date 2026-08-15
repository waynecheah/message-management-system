import { Module } from '@nestjs/common';
import { HealthController } from './interfaces/http/health.controller.ts';
import { AppConfigModule } from './infrastructure/config/config.module.ts';

@Module({ imports: [AppConfigModule], controllers: [HealthController] })
export class AppModule {}
