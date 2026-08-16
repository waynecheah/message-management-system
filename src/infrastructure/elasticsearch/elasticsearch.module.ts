import { Global, Module } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { MESSAGE_INDEXER } from '../../domain/ports/message-indexer.port.ts';
import { MESSAGE_SEARCHER } from '../../domain/ports/message-searcher.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { MESSAGE_INDEX_MAPPING } from './message-index.mapping.ts';
import { ES_CLIENT } from './es-client.token.ts';
import { EsMessageIndex } from './es-message-index.ts';

export { ES_CLIENT };

@Global()
@Module({
  providers: [
    {
      provide: ES_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const client = new Client({ node: config.ELASTICSEARCH_NODE });
        const exists = await client.indices.exists({ index: config.ELASTICSEARCH_INDEX });
        if (!exists) {
          await client.indices.create({
            index: config.ELASTICSEARCH_INDEX,
            mappings: MESSAGE_INDEX_MAPPING, // explicit, never dynamic
          });
        }
        return client;
      },
    },
    EsMessageIndex,
    { provide: MESSAGE_INDEXER, useExisting: EsMessageIndex },
    { provide: MESSAGE_SEARCHER, useExisting: EsMessageIndex },
  ],
  exports: [MESSAGE_INDEXER, MESSAGE_SEARCHER, ES_CLIENT],
})
export class ElasticsearchModule {}
