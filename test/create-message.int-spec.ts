import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './app.ts';
import { signTestToken } from './token.ts';

describe('POST /api/messages', () => {
  let app: INestApplication;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const post = () => request(app.getHttpServer()).post('/api/messages');

  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('creates a message and echoes the sender from the token', async () => {
    const res = await post().set(auth())
      .send({ conversationId: 'c1', content: 'hello' }).expect(201);
    expect(res.body).toMatchObject({ conversationId: 'c1', content: 'hello', senderId: 'sender-1' });
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(res.body.tenantId).toBeUndefined();
  });

  it.each([
    ['no token', undefined],
    ['a malformed token', 'Bearer not.a.token'],
    ['an expired token', `Bearer ${signTestToken({ expiresIn: '-1s' })}`],
    ['a token with no tid', `Bearer ${signTestToken({ tid: '' })}`],
    ['a token with no sub', `Bearer ${signTestToken({ sub: '' })}`],
  ])('rejects %s with 401', async (_label, header) => {
    const req = post().send({ conversationId: 'c1', content: 'hello' });
    if (header) req.set({ Authorization: header });
    await req.expect(401);
  });

  it('rejects a body that supplies senderId', async () => {
    await post().set(auth())
      .send({ conversationId: 'c1', content: 'hello', senderId: 'someone-else' })
      .expect(400);
  });

  it.each([
    ['blank content', { conversationId: 'c1', content: '   ' }],
    ['missing content', { conversationId: 'c1' }],
    ['missing conversationId', { content: 'hello' }],
    ['oversized content', { conversationId: 'c1', content: 'x'.repeat(4001) }],
    ['oversized metadata', { conversationId: 'c1', content: 'hi', metadata: { k: 'x'.repeat(5000) } }],
  ])('rejects %s with 400', async (_label, body) => {
    await post().set(auth()).send(body).expect(400);
  });

  it('rejects content that sanitizes away to nothing', async () => {
    await post().set(auth())
      .send({ conversationId: 'c1', content: '<script>alert(1)</script>' })
      .expect(400);
  });

  it('stores markup content sanitized', async () => {
    const res = await post().set(auth())
      .send({ conversationId: 'c1', content: 'hi <b>there</b>' }).expect(201);
    expect(res.body.content).toBe('hi there');
  });
});
