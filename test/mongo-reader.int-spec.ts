import type { INestApplication } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { Message } from '../src/domain/message.ts';
import { decodeCursor } from '../src/domain/cursor.ts';
import { MESSAGE_READER, type MessageReader } from '../src/domain/ports/message-reader.port.ts';
import { MESSAGE_WRITER, type MessageWriter } from '../src/domain/ports/message-writer.port.ts';
import { AlsIdentityContext } from '../src/infrastructure/identity/als-identity-context.ts';
import { MESSAGES_COLLECTION } from '../src/infrastructure/mongo/mongo.module.ts';
import { bootstrapTestApp, testEnv } from './app.ts';

const tenantA = { tenantId: 'tenant-a', senderId: 's1' };

describe('MongoMessageRepository reads', () => {
  let app: INestApplication;
  let reader: MessageReader;
  let writer: MessageWriter;
  let als: AlsIdentityContext;

  const seed = async (count: number, conversationId: string, tenantId = 'tenant-a') => {
    for (let i = 0; i < count; i += 1) {
      const message = Message.create({
        tenantId, conversationId, senderId: 's1',
        content: `message ${i}`, metadata: undefined,
      });
      await als.run({ tenantId, senderId: 's1' }, () => writer.save(message));
      await new Promise((r) => setTimeout(r, 2)); // distinct milliseconds
    }
  };

  beforeAll(async () => {
    app = await bootstrapTestApp();
    reader = app.get<MessageReader>(MESSAGE_READER);
    writer = app.get<MessageWriter>(MESSAGE_WRITER);
    als = app.get(AlsIdentityContext);
    await seed(5, 'paged');
    await seed(1, 'other-tenant', 'tenant-b');
  });

  afterAll(async () => {
    const client = await new MongoClient(testEnv.MONGO_URL).connect();
    await client.db(testEnv.MONGO_DB).dropDatabase();
    await client.close();
    await app.close();
  });

  const list = (query: Parameters<MessageReader['listByConversation']>[0]) =>
    als.run(tenantA, () => reader.listByConversation(query));

  it('returns newest first and hands back a cursor', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    expect(page.items.map((m) => m.content)).toEqual(['message 4', 'message 3']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('does not return the lookahead row as an item', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    expect(page.items).toHaveLength(2);
  });

  it('pages across a boundary without repeating or dropping', async () => {
    const first = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    const second = await list({
      conversationId: 'paged', limit: 2, direction: 'desc',
      cursor: decodeCursor(first.nextCursor as string, 'desc'),
    });
    expect(second.items.map((m) => m.content)).toEqual(['message 2', 'message 1']);
  });

  it('returns a null cursor on the last page', async () => {
    const page = await list({ conversationId: 'paged', limit: 50, direction: 'desc', cursor: null });
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('reverses with sort=asc using the same index', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'asc', cursor: null });
    expect(page.items.map((m) => m.content)).toEqual(['message 0', 'message 1']);
  });

  it('returns nothing for another tenant\'s conversation', async () => {
    const page = await list({
      conversationId: 'other-tenant', limit: 10, direction: 'desc', cursor: null,
    });
    expect(page.items).toEqual([]);
  });

  it('throws rather than wildcarding when no tenant is in context', async () => {
    await expect(
      reader.listByConversation({
        conversationId: 'paged', limit: 10, direction: 'desc', cursor: null,
      }),
    ).rejects.toThrow(/identity/i);
  });

  it('serves the query from the compound index with no in-memory sort', async () => {
    const collection = app.get(MESSAGES_COLLECTION);
    const plan = await collection
      .find({ tenantId: 'tenant-a', conversationId: 'paged' })
      .sort({ timestamp: -1, _id: -1 })
      .explain('queryPlanner');
    const stages = JSON.stringify(plan);
    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('"stage":"SORT"');
  });

  it('keeps a stable total order for ids generated in the same millisecond', async () => {
    const sameMs = 'tiebreak';
    const fixed = new Date('2026-08-15T00:00:00.000Z');
    // Only the clock is faked: the Mongo driver's sockets need real timers,
    // and faking nextTick/setImmediate stalls the insert mid-flight.
    jest
      .useFakeTimers({
        doNotFake: [
          'cancelAnimationFrame', 'cancelIdleCallback', 'clearImmediate', 'clearInterval',
          'clearTimeout', 'hrtime', 'nextTick', 'performance', 'queueMicrotask',
          'requestAnimationFrame', 'requestIdleCallback', 'setImmediate', 'setInterval',
          'setTimeout',
        ],
      })
      .setSystemTime(fixed);
    for (let i = 0; i < 5; i += 1) {
      const message = Message.create({
        tenantId: 'tenant-a', conversationId: sameMs, senderId: 's1',
        content: `same ${i}`, metadata: undefined,
      });
      await als.run(tenantA, () => writer.save(message));
    }
    jest.useRealTimers();

    const first = await list({ conversationId: sameMs, limit: 3, direction: 'desc', cursor: null });
    const second = await list({
      conversationId: sameMs, limit: 3, direction: 'desc',
      cursor: decodeCursor(first.nextCursor as string, 'desc'),
    });
    const ids = [...first.items, ...second.items].map((m) => m.id);
    expect(new Set(ids).size).toBe(5); // no repeats, no drops across the boundary
  });
});
