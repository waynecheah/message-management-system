import { Global, Module } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { MESSAGE_INDEXER } from '../../domain/ports/message-indexer.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { MESSAGE_INDEX_MAPPING } from './message-index.mapping.ts';

export const ES_CLIENT = Symbol('ElasticsearchClient');

// Imported after the token symbol above is assigned: this module and
// EsMessageIndex import each other, and Nest's @Inject(ES_CLIENT) decorator
// reads the token at class-definition time, so the token must already be set on
// this module's exports before the circular require resolves it.
import { EsMessageIndex } from './es-message-index.ts';

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
  ],
  exports: [MESSAGE_INDEXER, ES_CLIENT],
})
export class ElasticsearchModule {}
