import { Module } from '@nestjs/common';
import { HealthController } from './interfaces/http/health.controller.ts';
import { AppConfigModule } from './infrastructure/config/config.module.ts';
import { AuthModule } from './infrastructure/auth/auth.module.ts';
import { MongoModule } from './infrastructure/mongo/mongo.module.ts';

@Module({
  imports: [AppConfigModule, AuthModule, MongoModule],
  controllers: [HealthController],
})
export class AppModule {}
