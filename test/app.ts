import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.ts';
import { configure } from '../src/main.ts';
import { EnvConfig, validateEnv } from '../src/infrastructure/config/env.config.ts';
import { TEST_AUDIENCE, TEST_ISSUER, TEST_PUBLIC_KEY } from './token.ts';

export const testEnv = validateEnv({
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: `messages_test_${process.pid}`,
  KAFKA_BROKERS: 'localhost:9092',
  KAFKA_TOPIC: 'message-created',
  KAFKA_PARTITIONS: '3',
  KAFKA_GROUP_ID: `search-indexer-test-${Date.now()}`,
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  ELASTICSEARCH_INDEX: `messages_test_${process.pid}`,
  JWT_PUBLIC_KEY: TEST_PUBLIC_KEY,
  JWT_ISSUER: TEST_ISSUER,
  JWT_AUDIENCE: TEST_AUDIENCE,
});

export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvConfig)
    .useValue(testEnv)
    .compile();
  const app = moduleRef.createNestApplication();
  configure(app);
  await app.init();
  return app;
}
