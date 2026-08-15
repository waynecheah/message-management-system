import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import type { MessageView } from '../../domain/message-view.ts';
import type { MessageIndexer } from '../../domain/ports/message-indexer.port.ts';
import type { MessageSearcher, SearchQuery } from '../../domain/ports/message-searcher.port.ts';
import { IDENTITY_CONTEXT, type IdentityContext } from '../../domain/ports/identity-context.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { ES_CLIENT } from './es-client.token.ts';

type EsMessageSource = {
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
};

@Injectable()
export class EsMessageIndex implements MessageIndexer, MessageSearcher {
  constructor(
    @Inject(ES_CLIENT) private readonly client: Client,
    private readonly config: EnvConfig,
    @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext,
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

  async search(query: SearchQuery): Promise<MessageView[]> {
    // A request path, unlike index(): the tenant comes from the verified token.
    const { tenantId } = this.identity.require();

    const response = await this.client.search<EsMessageSource>({
      index: this.config.ELASTICSEARCH_INDEX,
      size: query.limit,
      query: {
        bool: {
          must: [{ match: { content: query.term } }], // DSL, never query_string
          filter: [ // filter context: unscored, cacheable
            { term: { tenantId } },
            { term: { conversationId: query.conversationId } },
          ],
        },
      },
    });

    return response.hits.hits.flatMap((hit) =>
      hit._id && hit._source ? [toView(hit._id, hit._source)] : [],
    );
  }
}

// the id comes from the document id, never from _source (spec §3)
function toView(id: string, source: EsMessageSource): MessageView {
  return {
    id,
    conversationId: source.conversationId,
    senderId: source.senderId,
    content: source.content,
    timestamp: new Date(source.timestamp),
    ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
  };
}
