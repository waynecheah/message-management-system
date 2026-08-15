import { Module } from '@nestjs/common';
import { HttpModule } from './interfaces/http/http.module.ts';
import { AppConfigModule } from './infrastructure/config/config.module.ts';
import { AuthModule } from './infrastructure/auth/auth.module.ts';
import { MongoModule } from './infrastructure/mongo/mongo.module.ts';
import { EventsModule } from './infrastructure/events/events.module.ts';

@Module({
  imports: [AppConfigModule, AuthModule, MongoModule, EventsModule, HttpModule],
})
export class AppModule {}
