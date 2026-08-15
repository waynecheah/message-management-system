import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './app.ts';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
