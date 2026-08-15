import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';

describe('GET /api/conversations/:conversationId/messages', () => {
  let app: INestApplication;
  let es: Client;
  const tokenA = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const tokenB = signTestToken({ tid: 'tenant-b', sub: 'sender-2' });
  const url = '/api/conversations/listing/messages';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).post('/api/messages')
        .set({ Authorization: `Bearer ${tokenA}` })
        .send({ conversationId: 'listing', content: `message ${i}` }).expect(201);
      await new Promise((r) => setTimeout(r, 2));
    }
  });
  afterAll(async () => {
    // Created messages flow through the live indexer into the shared
    // per-process ES index — clean up so they don't pollute readiness
    // checks in other integration files sharing this index (maxWorkers: 1
    // runs them all in one process).
    await es.indices.delete({ index: testEnv.ELASTICSEARCH_INDEX }, { ignore: [404] });
    await es.close();
    await app.close();
  });

  const get = (query = '') =>
    request(app.getHttpServer()).get(`${url}${query}`).set({ Authorization: `Bearer ${tokenA}` });

  it('returns an envelope, newest first', async () => {
    const res = await get('?limit=2').expect(200);
    expect(res.body.items.map((m: { content: string }) => m.content))
      .toEqual(['message 2', 'message 1']);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  it('follows the cursor to the next page', async () => {
    const first = await get('?limit=2').expect(200);
    const second = await get(`?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(second.body.items.map((m: { content: string }) => m.content)).toEqual(['message 0']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('reverses with sort=asc', async () => {
    const res = await get('?sort=asc&limit=1').expect(200);
    expect(res.body.items[0].content).toBe('message 0');
  });

  it.each([['?limit=0'], ['?limit=101'], ['?limit=abc'], ['?sort=sideways'], ['?cursor=!!!']])(
    'rejects %s with 400', async (query) => { await get(query).expect(400); },
  );

  it('rejects a desc cursor presented with sort=asc', async () => {
    const first = await get('?limit=1').expect(200);
    await get(`?sort=asc&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(400);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
  });

  it('gives another tenant an empty page, not a 404', async () => {
    const res = await request(app.getHttpServer()).get(url)
      .set({ Authorization: `Bearer ${tokenB}` }).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });
});
