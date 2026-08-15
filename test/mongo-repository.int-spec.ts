import { MongoClient, Binary } from 'mongodb';
import type { INestApplication } from '@nestjs/common';
import { Message } from '../src/domain/message.ts';
import { MESSAGE_WRITER } from '../src/domain/ports/message-writer.port.ts';
import type { MessageWriter } from '../src/domain/ports/message-writer.port.ts';
import { AlsIdentityContext } from '../src/infrastructure/identity/als-identity-context.ts';
import { MESSAGES_INDEX_NAME } from '../src/infrastructure/mongo/create-indexes.ts';
import { bootstrapTestApp, testEnv } from './app.ts';

describe('MongoMessageRepository', () => {
  let app: INestApplication;
  let writer: MessageWriter;
  let als: AlsIdentityContext;
  let client: MongoClient;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    writer = app.get<MessageWriter>(MESSAGE_WRITER);
    als = app.get(AlsIdentityContext);
    client = new MongoClient(testEnv.MONGO_URL);
    await client.connect();
  });

  afterAll(async () => {
    await client.db(testEnv.MONGO_DB).dropDatabase();
    await client.close();
    await app.close();
  });

  it('persists a message with a Binary _id and no id field', async () => {
    const message = Message.create({
      tenantId: 'tenant-a', conversationId: 'c1', senderId: 's1',
      content: 'stored', metadata: undefined,
    });
    await als.run({ tenantId: 'tenant-a', senderId: 's1' }, () => writer.save(message));

    const doc = await client.db(testEnv.MONGO_DB).collection('messages')
      .findOne({ conversationId: 'c1' });
    expect(doc?._id).toBeInstanceOf(Binary);
    expect(doc?.tenantId).toBe('tenant-a');
    expect(doc?.id).toBeUndefined();
  });

  it('declares the compound index at startup', async () => {
    const indexes = await client.db(testEnv.MONGO_DB).collection('messages').indexes();
    const compound = indexes.find((i) => i.name === MESSAGES_INDEX_NAME);
    expect(compound?.key).toEqual({ tenantId: 1, conversationId: 1, timestamp: -1, _id: -1 });
  });
});
