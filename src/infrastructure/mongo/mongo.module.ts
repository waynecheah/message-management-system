import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { EnvConfig } from '../config/env.config.ts';
import { MESSAGE_WRITER } from '../../domain/ports/message-writer.port.ts';
import { createIndexes } from './create-indexes.ts';
import type { MessageDocument } from './message.mapper.ts';

export const MONGO_CLIENT = Symbol('MongoClient');
export const MESSAGES_COLLECTION = Symbol('MessagesCollection');

// Imported after the token symbols above are assigned: this module and
// MongoMessageRepository import each other, and Nest's @Inject(MESSAGES_COLLECTION)
// decorator reads the token at class-definition time, so the token must already
// be set on this module's exports before the circular require resolves it.
import { MongoMessageRepository } from './mongo-message.repository.ts';

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const client = new MongoClient(config.MONGO_URL);
        await client.connect();
        return client;
      },
    },
    {
      provide: MESSAGES_COLLECTION,
      inject: [MONGO_CLIENT, EnvConfig],
      useFactory: async (client: MongoClient, config: EnvConfig) => {
        const collection = client.db(config.MONGO_DB).collection<MessageDocument>('messages');
        await createIndexes(collection);
        return collection;
      },
    },
    MongoMessageRepository,
    { provide: MESSAGE_WRITER, useExisting: MongoMessageRepository },
  ],
  exports: [MESSAGE_WRITER, MESSAGES_COLLECTION],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
