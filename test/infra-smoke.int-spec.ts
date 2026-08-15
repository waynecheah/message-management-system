import { MongoClient } from 'mongodb';
import { Kafka } from 'kafkajs';
import { Client as EsClient } from '@elastic/elasticsearch';

describe('infrastructure smoke', () => {
  it('reaches MongoDB', async () => {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const ping = await client.db('admin').command({ ping: 1 });
    expect(ping.ok).toBe(1);
    await client.close();
  });

  it('reaches Kafka', async () => {
    const admin = new Kafka({ clientId: 'smoke', brokers: ['localhost:9092'] }).admin();
    await admin.connect();
    expect(Array.isArray(await admin.listTopics())).toBe(true);
    await admin.disconnect();
  });

  it('reaches Elasticsearch', async () => {
    const es = new EsClient({ node: 'http://localhost:9200' });
    const health = await es.cluster.health();
    expect(['green', 'yellow']).toContain(health.status);
    await es.close();
  });
});
