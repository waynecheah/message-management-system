import { validateEnv } from './env.config.ts';

const valid = {
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: 'messages',
  KAFKA_BROKERS: 'localhost:9092',
  KAFKA_TOPIC: 'message-created',
  KAFKA_PARTITIONS: '3',
  KAFKA_GROUP_ID: 'search-indexer',
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  ELASTICSEARCH_INDEX: 'messages',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----',
  JWT_ISSUER: 'https://issuer.test',
  JWT_AUDIENCE: 'message-api',
};

describe('validateEnv', () => {
  it('returns a typed config for a complete environment', () => {
    const config = validateEnv(valid);
    expect(config.KAFKA_PARTITIONS).toBe(3);
    expect(config.PORT).toBe(3000);
  });

  it('throws when MONGO_URL is missing', () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.MONGO_URL;
    expect(() => validateEnv(rest)).toThrow(/MONGO_URL/);
  });

  it('throws when JWT_PUBLIC_KEY is not a PEM public key', () => {
    expect(() => validateEnv({ ...valid, JWT_PUBLIC_KEY: 'not-a-key' })).toThrow(/JWT_PUBLIC_KEY/);
  });
});
