import type { INestApplication } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import request from 'supertest';
import { Client } from '@elastic/elasticsearch';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import { waitFor } from './wait-for.ts';

describe('Kafka publishing', () => {
  let app: INestApplication;
  let es: Client;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });
  });
  afterAll(async () => {
    // The message published in the test below is consumed by the live
    // indexer and lands in the shared per-process ES index — clean it up so
    // it doesn't pollute readiness checks in other integration files that
    // share this index (maxWorkers: 1 runs them all in one process).
    await es.indices.delete({ index: testEnv.ELASTICSEARCH_INDEX }, { ignore: [404] });
    await es.close();
    await app.close();
  });

  it('creates the topic with the configured partition count', async () => {
    const admin = new Kafka({ clientId: 'assert', brokers: [testEnv.KAFKA_BROKERS] }).admin();
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata({ topics: [testEnv.KAFKA_TOPIC] });
    expect(metadata.topics[0]?.partitions).toHaveLength(testEnv.KAFKA_PARTITIONS);
    await admin.disconnect();
  });

  it('publishes a created message keyed by tenant and conversation', async () => {
    const kafka = new Kafka({ clientId: 'probe', brokers: [testEnv.KAFKA_BROKERS] });
    const consumer = kafka.consumer({ groupId: `probe-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({ topic: testEnv.KAFKA_TOPIC, fromBeginning: false });

    const received: { key: string; value: string }[] = [];
    await consumer.run({
      eachMessage: async ({ message }) => {
        received.push({ key: String(message.key), value: String(message.value) });
      },
    });

    await request(app.getHttpServer()).post('/api/messages')
      .set({ Authorization: `Bearer ${token}` })
      .send({ conversationId: 'published', content: 'over the wire' }).expect(201);

    await waitFor(() => received.length > 0);
    expect(received[0]?.key).toBe('tenant-a:published');
    const event = JSON.parse(received[0]!.value);
    expect(event).toMatchObject({ tenantId: 'tenant-a', conversationId: 'published',
      senderId: 'sender-1', content: 'over the wire' });
    expect(typeof event.timestamp).toBe('string');

    await consumer.disconnect();
  });
});
