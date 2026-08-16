import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { Consumer } from 'kafkajs';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import { waitFor } from './wait-for.ts';
import { MessageCreatedConsumer } from '../src/infrastructure/kafka/message-created.consumer.ts';

describe('message indexing pipeline', () => {
  let app: INestApplication;
  let es: Client;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });
  });
  afterAll(async () => {
    // Close the app first so the live consumer stops indexing before we
    // delete the index — otherwise a late-arriving event could recreate it
    // via Elasticsearch's dynamic auto-create-index default, defeating the
    // explicit strict mapping every other index in this suite relies on.
    await app.close();
    await es.indices.delete({ index: testEnv.ELASTICSEARCH_INDEX }, { ignore: [404] });
    await es.close();
  });

  const created = async (content: string) =>
    (await request(app.getHttpServer()).post('/api/messages')
      .set({ Authorization: `Bearer ${token}` })
      .send({ conversationId: 'indexed', content }).expect(201)).body;

  const findById = async (id: string) => {
    await waitFor(async () => (await es.exists({ index: testEnv.ELASTICSEARCH_INDEX, id })));
    return es.get({ index: testEnv.ELASTICSEARCH_INDEX, id });
  };

  it('indexes a created message under its own id', async () => {
    const message = await created('indexed by the consumer');
    const doc = await findById(message.id);
    expect(doc._source).toMatchObject({
      tenantId: 'tenant-a', conversationId: 'indexed', content: 'indexed by the consumer',
    });
    expect((doc._source as Record<string, unknown>).id).toBeUndefined();
  });

  it('applies the explicit mapping, not a dynamic one', async () => {
    const mapping = await es.indices.getMapping({ index: testEnv.ELASTICSEARCH_INDEX });
    const properties = Object.values(mapping)[0]?.mappings.properties;
    expect(properties?.content).toMatchObject({ type: 'text' });
    expect(properties?.tenantId).toMatchObject({ type: 'keyword' });
    expect(properties?.metadata).toMatchObject({ enabled: false });
  });

  it('leaves state identical when the same event is consumed twice', async () => {
    const message = await created('consumed twice');
    const first = await findById(message.id);
    const consumer = app.get(MessageCreatedConsumer);
    await consumer.handle({
      id: message.id, tenantId: 'tenant-a', conversationId: 'indexed',
      senderId: 'sender-1', content: 'consumed twice', timestamp: message.timestamp,
    });
    await es.indices.refresh({ index: testEnv.ELASTICSEARCH_INDEX });
    const second = await es.get({ index: testEnv.ELASTICSEARCH_INDEX, id: message.id });
    expect(second._source).toEqual(first._source);
    const count = await es.count({
      index: testEnv.ELASTICSEARCH_INDEX,
      query: { term: { _id: message.id } },
    });
    expect(count.count).toBe(1);
  });

  it('reports the indexer as running on /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', indexer: 'running' });
  });

  it('reports 503 once the indexer has stopped', async () => {
    app.get(MessageCreatedConsumer).markStopped('test-induced');
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', indexer: 'stopped' });
  });

  // Runs last: state manipulation in this describe block used to be one-way
  // (markStopped only), but this proves the real recovery path — a genuine
  // group rejoin, not a manual state flip — clears the flag kafkajs's own
  // crash-then-restart cycle would also clear via the same 'consumer.group_join'
  // listener.
  it('recovers once the consumer rejoins its group after a stop/restart', async () => {
    const consumer = app.get(MessageCreatedConsumer);
    const kafkaConsumer = (consumer as unknown as { consumer: Consumer }).consumer;
    await kafkaConsumer.stop();
    await kafkaConsumer.run({ eachMessage: async () => {} });
    await waitFor(async () => consumer.isRunning());
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', indexer: 'running' });
  });
});
