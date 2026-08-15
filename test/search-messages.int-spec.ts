import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import { waitFor } from './wait-for.ts';

describe('GET /api/conversations/:conversationId/messages/search', () => {
  let app: INestApplication;
  let es: Client;
  const tokenA = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const tokenB = signTestToken({ tid: 'tenant-b', sub: 'sender-2' });
  const url = '/api/conversations/searchable/messages/search';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });

    const post = async (token: string, content: string) =>
      (await request(app.getHttpServer()).post('/api/messages')
        .set({ Authorization: `Bearer ${token}` })
        .send({ conversationId: 'searchable', content }).expect(201)).body;

    const posted = await Promise.all([
      post(tokenA, 'the quick brown fox'),
      post(tokenA, 'a slow green turtle'),
      post(tokenB, 'the quick brown fox belonging to tenant b'),
    ]);

    // Wait for the consumer to index this test's own messages specifically —
    // a generic collection-wide count can be satisfied by leftover documents
    // from other test files sharing this same per-process ES index.
    await waitFor(async () => {
      const exists = await Promise.all(
        posted.map((message: { id: string }) =>
          es.exists({ index: testEnv.ELASTICSEARCH_INDEX, id: message.id })),
      );
      return exists.every(Boolean);
    });
    await es.indices.refresh({ index: testEnv.ELASTICSEARCH_INDEX });
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

  const search = (query: string, token = tokenA) =>
    request(app.getHttpServer()).get(`${url}${query}`).set({ Authorization: `Bearer ${token}` });

  it('finds a message by a word in its content', async () => {
    const res = await search('?q=quick').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      content: 'the quick brown fox', conversationId: 'searchable', senderId: 'sender-1',
    });
    expect(res.body.items[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('returns an empty envelope when nothing matches', async () => {
    const res = await search('?q=aardvark').expect(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('never returns another tenant\'s messages', async () => {
    const res = await search('?q=quick', tokenB).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].content).toContain('tenant b');
  });

  it.each([['?q='], ['?q=' + 'x'.repeat(257)], ['?q=hi&limit=0'], ['?q=hi&limit=101']])(
    'rejects %s with 400', async (query) => { await search(query).expect(400); },
  );

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(`${url}?q=quick`).expect(401);
  });
});
