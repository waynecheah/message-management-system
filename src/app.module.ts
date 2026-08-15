import { Module } from '@nestjs/common';
import { HealthController } from './interfaces/http/health.controller.ts';

@Module({ controllers: [HealthController] })
export class AppModule {}
