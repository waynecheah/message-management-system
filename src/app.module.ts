import { Module } from '@nestjs/common';
import { KafkaModule } from './infrastructure/kafka/kafka.module.ts';
import { HttpModule } from './interfaces/http/http.module.ts';
import { AppConfigModule } from './infrastructure/config/config.module.ts';
import { AuthModule } from './infrastructure/auth/auth.module.ts';
import { MongoModule } from './infrastructure/mongo/mongo.module.ts';
import { ElasticsearchModule } from './infrastructure/elasticsearch/elasticsearch.module.ts';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    MongoModule,
    ElasticsearchModule,
    KafkaModule,
    HttpModule,
  ],
})
export class AppModule {}
