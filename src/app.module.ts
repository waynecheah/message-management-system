import { Module } from '@nestjs/common';
import { HttpModule } from './interfaces/http/http.module.ts';
import { AppConfigModule } from './infrastructure/config/config.module.ts';
import { AuthModule } from './infrastructure/auth/auth.module.ts';
import { MongoModule } from './infrastructure/mongo/mongo.module.ts';
import { KafkaModule } from './infrastructure/kafka/kafka.module.ts';

@Module({
  imports: [AppConfigModule, AuthModule, MongoModule, KafkaModule, HttpModule],
})
export class AppModule {}
