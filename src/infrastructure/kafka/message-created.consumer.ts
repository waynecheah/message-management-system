import {
  Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit,
} from '@nestjs/common';
import { Kafka, type Consumer } from 'kafkajs';
import { IndexMessage } from '../../application/index-message.usecase.ts';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import { EnvConfig } from '../config/env.config.ts';
import { KAFKA_CLIENT } from './kafka.module.ts';

@Injectable()
export class MessageCreatedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageCreatedConsumer.name);
  private readonly consumer: Consumer;
  private state: 'running' | 'stopped' = 'stopped';

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: EnvConfig,
    private readonly indexMessage: IndexMessage,
  ) {
    this.consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID });
  }

  async onModuleInit(): Promise<void> {
    this.consumer.on('consumer.crash', (event) => {
      this.markStopped(String(event.payload.error));
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.KAFKA_TOPIC, fromBeginning: false });
    await this.consumer.run({
      // kafkajs commits only after this resolves; a throw means redelivery,
      // which the id-keyed upsert makes a no-op (ADR-0011).
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        await this.handle(JSON.parse(message.value.toString()) as MessageCreatedEvent);
      },
    });
    this.state = 'running';
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  async handle(event: MessageCreatedEvent): Promise<void> {
    await this.indexMessage.execute(event);
  }

  markStopped(reason: string): void {
    this.state = 'stopped';
    this.logger.error(`indexer halted: ${reason}`);
  }

  isRunning(): boolean {
    return this.state === 'running';
  }
}
