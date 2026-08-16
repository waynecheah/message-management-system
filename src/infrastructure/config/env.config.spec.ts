import { generateKeyPairSync } from 'node:crypto';
import { validateEnv } from './env.config.ts';

const { publicKey: es256PublicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const { publicKey: rsaPublicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const { privateKey: es256PrivateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const valid = {
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: 'messages',
  KAFKA_BROKERS: 'localhost:9092',
  KAFKA_TOPIC: 'message-created',
  KAFKA_PARTITIONS: '3',
  KAFKA_GROUP_ID: 'search-indexer',
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  ELASTICSEARCH_INDEX: 'messages',
  JWT_PUBLIC_KEY: es256PublicKey,
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

  it('throws when JWT_PUBLIC_KEY is a well-formed PEM header but invalid ASN.1', () => {
    const malformed = '-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----';
    expect(() => validateEnv({ ...valid, JWT_PUBLIC_KEY: malformed })).toThrow(/JWT_PUBLIC_KEY/);
  });

  it('throws when JWT_PUBLIC_KEY is a valid PEM key but not EC P-256', () => {
    expect(() => validateEnv({ ...valid, JWT_PUBLIC_KEY: rsaPublicKey })).toThrow(/JWT_PUBLIC_KEY/);
  });

  it('throws when JWT_PUBLIC_KEY is a P-256 private key', () => {
    expect(() => validateEnv({ ...valid, JWT_PUBLIC_KEY: es256PrivateKey })).toThrow(/JWT_PUBLIC_KEY/);
  });
});
