import { Inject, Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { Message } from '../../domain/message.ts';
import type { MessageWriter } from '../../domain/ports/message-writer.port.ts';
import { MESSAGES_COLLECTION } from './mongo.module.ts';
import { toDocument, type MessageDocument } from './message.mapper.ts';

@Injectable()
export class MongoMessageRepository implements MessageWriter {
  constructor(
    @Inject(MESSAGES_COLLECTION) private readonly collection: Collection<MessageDocument>,
  ) {}

  async save(message: Message): Promise<void> {
    await this.collection.insertOne(toDocument(message));
  }
}
