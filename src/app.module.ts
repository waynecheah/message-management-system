import { Module } from '@nestjs/common';
// KafkaModule is imported before HttpModule deliberately. HealthController now
// imports MessageCreatedConsumer, which imports KAFKA_CLIENT back out of
// kafka.module.ts — entering that cycle from the controller would leave
// KafkaModule's own `providers` holding an undefined MessageCreatedConsumer.
// Loading kafka.module.ts first makes it the entry point, so the consumer class
// is fully defined by the time either side reads it.
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
