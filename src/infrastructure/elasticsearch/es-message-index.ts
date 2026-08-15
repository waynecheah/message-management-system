import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import type { MessageIndexer } from '../../domain/ports/message-indexer.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { ES_CLIENT } from './elasticsearch.module.ts';

@Injectable()
export class EsMessageIndex implements MessageIndexer {
  constructor(
    @Inject(ES_CLIENT) private readonly client: Client,
    private readonly config: EnvConfig,
  ) {}

  /** Tenant comes from the event: the consumer has no ambient context (ADR-0012). */
  async index(event: MessageCreatedEvent): Promise<void> {
    await this.client.index({
      index: this.config.ELASTICSEARCH_INDEX,
      id: event.id, // upsert by message id — replay is a no-op (ADR-0011)
      document: {
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        content: event.content,
        timestamp: event.timestamp,
        ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
      },
    });
  }
}
