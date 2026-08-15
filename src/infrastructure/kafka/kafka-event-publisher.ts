import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import type { EventPublisher } from '../../domain/ports/event-publisher.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { KAFKA_CLIENT } from './kafka-client.token.ts';

@Injectable()
export class KafkaEventPublisher implements EventPublisher, OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: EnvConfig,
  ) {
    this.producer = kafka.producer({
      idempotent: true, // implies acks:-1, maxInFlight:1
      retry: { retries: 2, initialRetryTime: 100 }, // a broker outage must not stall writes
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(event: MessageCreatedEvent): Promise<void> {
    await this.producer.send({
      topic: this.config.KAFKA_TOPIC,
      timeout: 2000,
      messages: [
        {
          // per-conversation ordering: one conversation, one partition (ADR-0010)
          key: `${event.tenantId}:${event.conversationId}`,
          value: JSON.stringify(event),
        },
      ],
    });
  }
}
