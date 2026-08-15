import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { EnvConfig } from '../config/env.config.ts';
import { MESSAGE_READER } from '../../domain/ports/message-reader.port.ts';
import { MESSAGE_WRITER } from '../../domain/ports/message-writer.port.ts';
import { createIndexes } from './create-indexes.ts';
import type { MessageDocument } from './message.mapper.ts';
import { MESSAGES_COLLECTION, MONGO_CLIENT } from './mongo-client.token.ts';
import { MongoMessageRepository } from './mongo-message.repository.ts';

export { MESSAGES_COLLECTION, MONGO_CLIENT };

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
    { provide: MESSAGE_READER, useExisting: MongoMessageRepository },
  ],
  exports: [MESSAGE_WRITER, MESSAGE_READER, MESSAGES_COLLECTION],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
