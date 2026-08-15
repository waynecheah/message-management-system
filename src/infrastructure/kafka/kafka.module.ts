import { Global, Module } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { EVENT_PUBLISHER } from '../../domain/ports/event-publisher.port.ts';
import { EnvConfig } from '../config/env.config.ts';

export const KAFKA_CLIENT = Symbol('KafkaClient');

// Imported after the token symbol above is assigned: this module and
// KafkaEventPublisher import each other, and Nest's @Inject(KAFKA_CLIENT)
// decorator reads the token at class-definition time, so the token must already
// be set on this module's exports before the circular require resolves it.
import { KafkaEventPublisher } from './kafka-event-publisher.ts';

@Global()
@Module({
  providers: [
    {
      provide: KAFKA_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const kafka = new Kafka({
          clientId: 'message-management',
          brokers: config.KAFKA_BROKERS.split(','),
        });
        // Auto-create is off in compose: one partition would erase the topology (ADR-0010)
        const admin = kafka.admin();
        await admin.connect();
        await admin.createTopics({
          topics: [{ topic: config.KAFKA_TOPIC, numPartitions: config.KAFKA_PARTITIONS }],
        });
        await admin.disconnect();
        return kafka;
      },
    },
    KafkaEventPublisher,
    { provide: EVENT_PUBLISHER, useExisting: KafkaEventPublisher },
  ],
  exports: [EVENT_PUBLISHER, KAFKA_CLIENT],
})
export class KafkaModule {}
