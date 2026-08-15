---
title: Design - Message Management System
description: The build design for the three message endpoints, the Kafka-to-Elasticsearch pipeline, and the test suite
---

# Design — Message Management System

Date: 2026-08-14

Scope of this document: **how** the system in `CONTEXT.md` gets built. The
architectural decisions themselves are already settled in `docs/adr/` and are
not re-opened here — this design applies them and records the choices the ADRs
left open.

## Decisions taken during this design

Questions the ADRs did not settle, resolved here:

| Question | Decision |
| --- | --- |
| Search read path | Return the Elasticsearch `_source` directly; do not hydrate from MongoDB |
| Sorting surface | `sort=asc\|desc` on `timestamp` only, both directions of the same keyset |
| Consumer process boundary | Same process as the API, started on bootstrap |
| Build strategy | Vertical slices, endpoint by endpoint, with the compose stack in slice 0 |
| Skeleton | Hand-scaffolded. **Do not run `nest new`** — amends ADR-0005 |
| TypeScript version | Pinned to `^5.9`, not `^7` |

Resolved in the 2026-08-14 grilling pass, each in the section it governs:

| Question | Decision |
| --- | --- |
| Decorator support | tsconfig gains `experimentalDecorators` + `emitDecoratorMetadata`; without them nub will not run Nest at all |
| Swagger CLI plugin | Cannot run under nub — `@ApiProperty` written by hand; amends ADR-0019 |
| ALS entry point | A global interceptor, not middleware and not the guard; amends ADR-0012 |
| Read return type | Read ports return `MessageView`, not the entity (ADR-0020) |
| Cursor id conversion | The mapper owns it; the repository calls `toBinaryId` |
| ES `id` field | Taken from `hit._id`; mapping is `dynamic: strict` |
| Sanitization order | After `ValidationPipe`, in a pipe — bounds apply to the raw value |
| Response shape | Both read endpoints return an envelope |
| Bad `limit` | 400, never a clamp |
| `metadata` bound | <= 4 KB serialized; body capped at 256 KB |
| Publish budget | Awaited, but bounded to ~2s so a broker outage cannot stall writes |
| Domain errors | 400 for client faults, 500 for the rest; cross-tenant reads are `200 { items: [] }` |
| Halted indexer | Reported by `/health` as 503 degraded |
| Test isolation | Integration tests run serially in their own Jest project, under a random consumer group id |

## 0. Toolchain prerequisites

Verified by probe against `nub` 0.6.0 on Node 24.12, before any code was written.

**`nub` refuses Stage 3 decorators** — the oxc transpiler does not implement
them. NestJS therefore cannot run under the repository's current
`tsconfig.json`, which sets neither decorator flag. Slice 0 adds both:

```jsonc
"experimentalDecorators": true,   // legacy decorators — the shape Nest is written against
"emitDecoratorMetadata": true,    // design:paramtypes — Nest DI reads this
```

With those two flags, the probe confirms decorators execute and
`design:paramtypes` is emitted. ESM (`"type": "module"`), `verbatimModuleSyntax`
and `allowImportingTsExtensions` all survive alongside them — parameter types
still resolve across a `.ts` import — so none of the repository's existing
compiler posture has to be given up.

**TypeScript is pinned to `^5.9`.** `^7` is the native `tsgo` compiler; `ts-jest`
and `typescript-eslint` are built against the 5.x compiler API. `nub` transpiles
at runtime, so TypeScript here only serves typecheck, lint and `ts-jest` —
nothing gains from 7, and three tools could break at once inside the timebox.

**The skeleton is hand-written, not generated.** `nest new` picks its own package
manager and emits npm-flavoured scripts (ADR-0003), and generates the flat
feature shape ADR-0005 calls a trap. Slice 0 instead runs `nub add` for the Nest
packages and writes `main.ts` and `app.module.ts` by hand, directly in the four
layers. **Action: amend ADR-0005**, whose current text permits `nest new` for the
initial skeleton.

## 1. Module and layer map

```
src/
  main.ts                    ValidationPipe(whitelist, forbidNonWhitelisted, transform),
                             exception filter, Swagger, enableShutdownHooks, listen
  app.module.ts              module wiring + APP_GUARD (global JwtAuthGuard)

  domain/                    imports nothing from the other three layers
    message.ts               entity — private ctor, static create(), immutable
                             WRITE PATH ONLY (ADR-0020)
    message-view.ts          read projection — plain immutable type, no behaviour
    message-created.event.ts event payload
    cursor.ts                (timestamp, id, direction) — encode/decode, rejects malformed
    page.ts                  Page<T> { items, nextCursor }
    errors.ts                DomainError + typed subclasses
    uuid-v7.ts               v7 generator (node:crypto randomBytes; NOT randomUUID)
    ports/
      message-writer.port.ts       save(message: Message)
      message-reader.port.ts       listByConversation(...) : Page<MessageView>
      message-searcher.port.ts     search(...) : MessageView[]
      message-indexer.port.ts      index(message)
      event-publisher.port.ts      publish(event)
      identity-context.port.ts     require() : { tenantId, senderId }

  application/               @Injectable() lives here and nowhere below
    create-message.usecase.ts
    list-conversation-messages.usecase.ts
    search-conversation-messages.usecase.ts
    index-message.usecase.ts          driven by the consumer, not by HTTP

  infrastructure/            implements the ports
    config/         env.config.ts (class-validator), config.module.ts
    identity/       als-identity-context.ts        AsyncLocalStorage adapter
                    identity.interceptor.ts        APP_INTERCEPTOR — enters the store
    mongo/          client provider, message.mapper.ts (_id <-> id, the ONLY place),
                    mongo-message.repository.ts (writer + reader), create-indexes.ts
    kafka/          kafka.client.ts, kafka-event-publisher.ts,
                    message-created.consumer.ts (onModuleInit / onModuleDestroy)
    elasticsearch/  client, message-index.mapping.ts, es-message-index.ts (indexer + searcher)
    auth/           jwt.strategy.ts, jwt-auth.guard.ts, public.decorator.ts

  interfaces/http/
    messages.controller.ts               POST /api/messages
    conversation-messages.controller.ts  GET list + GET search
    health.controller.ts                 the only @Public() route
    dto/                                 create, list-query, search-query, message-response
    sanitize-content.pipe.ts             runs after ValidationPipe
    domain-exception.filter.ts           DomainError -> HTTP status
```

Layer-first at the top level, per ADR-0005. The ESLint
`import/no-restricted-paths` zones in that ADR are configured in slice 0 and
must pass before every commit.

### Six single-method ports, not one repository

Interface segregation taken literally (ADR-0006): `IndexMessage` receives
`MessageIndexer` and is structurally unable to reach `save`.
`MongoMessageRepository` implements writer and reader in one class, because both
share the collection handle and the mapper; nothing else shares an
implementation.

### `IdentityContext` — amends ADR-0012

ADR-0012's good pattern shows `tenantContext.require()`. The create use case
also needs `senderId`, and ADR-0018's good pattern forbids the controller
passing identity into the use case, so the port carries both claims and is named
`IdentityContext`:

```ts
// domain/ports/identity-context.port.ts
export interface IdentityContext {
  require(): { tenantId: string; senderId: string };   // throws when absent
}
```

One ALS adapter implements it, used by both the use cases and the Mongo
repository. Enforcement is unchanged — a missing context still throws, and is
never a wildcard. ADR-0012 carries a dated amendment recording the rename.

### The store is entered by an interceptor

ADR-0012 originally said middleware populates the ALS. It cannot: middleware
runs *before* the guard, so the token is still unverified there. Nor can the
guard — `canActivate` returns a boolean, so an `als.run(cb)` inside it exits as
soon as it returns.

A global `APP_INTERCEPTOR` is the only placement that is both after verification
and able to wrap execution. It reads `request.user` (set by the passport
strategy) and wraps `next.handle()`, so pipes, handler, use case and repository
all run inside the store:

```ts
// infrastructure/identity/identity.interceptor.ts
intercept(ctx: ExecutionContext, next: CallHandler) {
  const { user } = ctx.switchToHttp().getRequest();
  return new Observable((sub) =>
    als.run({ tenantId: user.tenantId, senderId: user.senderId },
      () => next.handle().subscribe(sub)));
}
```

`als.enterWith()` in the guard is one line shorter and was rejected: it binds
the store to the remainder of the current async resource rather than to a
bounded callback, which risks bleeding across requests.

On the `@Public()` health route there is no `user`, so no store is entered —
`require()` downstream then throws, which is the intended fail-closed behaviour.

### Sanitization sits at the boundary — after validation, not inside it

`sanitize-html` runs in a `SanitizeContentPipe` registered **after**
`ValidationPipe`, not in a `class-transformer` `@Transform`. It stays a boundary
concern (ADR-0015) — nothing moves into `application/` — but the ordering
changes, and it changes for two reasons.

`ValidationPipe` calls `plainToInstance` before it validates, so a `@Transform`
runs ahead of every validator. That would mean:

- **Bounds would apply to sanitized output.** `sanitize-html` escapes text
  entities (`&` → `&amp;`, `<` → `&lt;`), so a legitimate 4000-character message
  full of ampersands grows to roughly 20 000 and is rejected for a length the
  client never sent.
- **`Message.create`'s blank check would be unreachable over HTTP**, since the
  DTO always catches it first — leaving the entity's one genuine invariant
  decorative.

Validating first fixes both. The DTO bounds what the client actually sent, the
pipe sanitizes afterwards, and content that sanitizes away to nothing reaches
`Message.create` and is refused there — a typed domain error the filter maps to
400.

```ts
// main.ts
app.use(json({ limit: '256kb' }));          // sanitize-html never parses a megabyte
app.useGlobalPipes(new ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true, transform: true }));
app.useGlobalPipes(new SanitizeContentPipe());
```

## 2. The create path

```
POST /api/messages
  JwtAuthGuard          verify ES256 (algorithms pinned), iss, aud, exp;
                        reject if tid or sub is missing
  -> ALS.run({ tenantId, senderId })
  -> ValidationPipe     CreateMessageDto: conversationId, content, metadata?
                        (senderId in the body -> 400, not silently ignored)
  -> CreateMessage.execute(dto)
       identity.require()          tenantId + senderId from the verified claims
       Message.create(...)         id = UUIDv7, timestamp = server clock
       writer.save(message)        MongoDB — authoritative
       publisher.publish(event)    Kafka, key = `${tenantId}:${conversationId}`
  -> 201 { id, conversationId, senderId, content, timestamp, metadata }
```

`timestamp` is server-assigned and is not a request field. `id` is generated in
the domain before persistence (ADR-0008), which is what lets the same id key
both stores.

**One clock read, two uses.** `Message.create` reads `Date.now()` once and
derives both the v7 id and the timestamp from it, so the id's embedded
millisecond and the exposed timestamp never disagree — which is what ADR-0013's
"v7 is broadly chronological, so the tiebreaker is meaningful" argument rests on.

```ts
static create(props: CreateProps): Message {
  const now = Date.now();
  return new Message(uuidV7(now), new Date(now), /* … */);
}
```

No `Clock` port: it would be a port with no invariant behind it (ADR-0016).
Determinism in tests comes from Jest fake timers.

### Content is checked twice, and both checks fire

`sanitize-html` can reduce `<script>alert(1)</script>` to the empty string, so
sanitization *creates* the blank-content case rather than only passing it
through. The two checks catch different inputs, and with the pipe ordering above
each is genuinely reachable:

| Input | Rejected by |
| --- | --- |
| `""`, `"   "` | DTO — `@IsNotEmpty()` on the raw value |
| `"<script>alert(1)</script>"` | `Message.create` — blank *after* sanitization |

The second is the entity's one genuine invariant (ADR-0016), not redundancy.
Both get a test, and the integration suite asserts the script case returns 400
rather than storing an empty message.

### Bounds

| Field | Bound |
| --- | --- |
| `content` | non-blank, <= 4000 characters (of the **raw** value) |
| `conversationId` | non-blank, <= 128 characters |
| `metadata` | optional object, <= 4 KB serialized |
| request body | <= 256 KB JSON |

Oversized content is a required edge case (ADR-0014), so the limit is a stated
number rather than an implicit one — and the same reasoning gives `metadata` a
number instead of leaving it to the body cap. It is stored verbatim in MongoDB
*and* kept in the Elasticsearch `_source` (`enabled: false` indexes nothing but
stores everything), so an unbounded object is paid for twice.

The type stays `Record<string, any>`: it is declared verbatim in `CONTEXT.md`'s
data model, and narrowing it to primitives would be a deviation from the given
contract rather than a hardening of it.

```ts
@IsOptional() @IsObject() @MaxJsonBytes(4096)
metadata?: Record<string, any>;
```

### The event carries the whole message

The payload is the full message, not just the id. The consumer then indexes
without reading back from MongoDB — no read-your-write race against the primary,
and the consumer needs no tenant context of its own, which matters because it
runs outside the request lifecycle and has no ambient tenant (ADR-0012).

### Publish failure returns 201 — within a bounded wait

The message is in the system of record, so the request succeeded. Failing it
would invite a client retry that writes a second message under a new id. The
failure is logged at error level and never swallowed (ADR-0011). The cost — that
message is absent from search until a backfill — is the write-then-publish gap
that ADR-0011 already accepts, and it is named in the README beside the
transactional-outbox note.

**The wait is bounded explicitly.** kafkajs defaults to five retries with
exponential backoff and a 30-second send timeout, so with a broker down every
POST would take about thirty seconds *and then return 201* — the worst of both.
The producer is configured for a short budget instead:

```ts
kafka.producer({
  idempotent: true,                                 // implies acks:-1, maxInFlight:1
  retry: { retries: 2, initialRetryTime: 100 },
});
await producer.send({ topic, timeout: 2000, messages: [...] });
```

The send is still awaited, so save-precedes-publish holds and the unit test that
asserts that ordering stays meaningful.

## 3. The read paths

### List

```
GET /api/conversations/:conversationId/messages?limit=&sort=&cursor=

limit   default 20, 1..100           sort  asc | desc (default desc)
cursor  base64url of (timestamp, id, direction) — opaque, parsed defensively

An out-of-range or unparseable `limit` is a **400, never a clamp**. ADR-0013 says
reject, not repair; and a client that asks for 500 and silently receives 100 has
been lied to. Same posture as `forbidNonWhitelisted`, which already treats an
unexpected field as an error rather than something to quietly drop.

Mongo:  { tenantId, conversationId, $or: [ keyset ] }
        .sort({ timestamp: dir, _id: dir }).limit(limit + 1)
-> 200  { items: [...], nextCursor: string | null }
```

- **`limit + 1`, not a count query.** The extra row reveals whether a next page
  exists and supplies its cursor. A `countDocuments` alongside every page would
  scan the whole conversation to answer what one extra row answers for free.
- **The cursor encodes its direction.** ADR-0013 records that a sort change
  invalidates outstanding cursors, so the cursor carries enough to detect it:
  presenting a `desc` cursor with `sort=asc` is a 400, not a silently wrong page.
- **The mapper converts the cursor's id, not the repository.** The keyset bound
  needs a BSON `UUID` built from the cursor's canonical string, which would be a
  second site translating `id` → `_id` and break ADR-0008's single-place rule.
  The mapper exports `toBinaryId` / `toStringId`, and the repository calls them.
  The repository still *names* `_id` in the filter and the sort — unavoidable —
  but it never knows how the value is represented.
- **The tiebreaker is correct only because Binary sorts the same way v7 does.**
  MongoDB orders `BinData` by length, then subtype, then byte-by-byte. Every
  message `_id` is 16 bytes of subtype 4, so the comparison is byte-wise — and a
  UUIDv7 leads with its 48-bit big-endian millisecond timestamp, so byte order is
  time order, matching the canonical string order the cursor carries. This is
  load-bearing and non-obvious: it gets an explicit test that inserts ids
  generated in the same millisecond and asserts a stable total order.
- **One index serves both directions:**
  `(tenantId: 1, conversationId: 1, timestamp: -1, _id: -1)`. MongoDB walks an
  index backwards at the same cost, so `asc` needs no second index. `_id` is the
  fourth field so the tiebreaker sorts in the index rather than in memory.
- **`explain()` is asserted, not merely inspected.** An integration test checks
  the winning plan is an `IXSCAN` with no `SORT` stage, so a later index or sort
  change fails the build instead of quietly degrading. A `nub run db:explain`
  script prints the same plan for pasting into the README.

  ```ts
  const plan = await collection.find(keysetFilter)
    .sort({ timestamp: -1, _id: -1 }).explain('queryPlanner');
  expect(stages(plan)).toContain('IXSCAN');
  expect(stages(plan)).not.toContain('SORT');
  ```

### Search

```
GET /api/conversations/:conversationId/messages/search?q=&limit=

ES:  bool {
       must:   [ { match: { content: q } } ],        scored
       filter: [ { term: { tenantId } },             filter context — unscored, cacheable
                 { term: { conversationId } } ]
     }
-> 200  { items: [...] }        relevance order
```

**Both read endpoints return an envelope.** Sibling endpoints over the same
resource returning different container shapes reads as an oversight, and the
envelope leaves room to add `search_after` later as an additive change rather
than a breaking one. An empty result is `200 { items: [] }`.

`match` against a DSL object — never `query_string`, never string concatenation
(ADR-0015). `q` is validated: non-blank, <= 256 characters. An empty result is a
`200 { items: [] }`, which is a required edge case.

**Returning the hit directly** — no hydration from MongoDB — keeps search to one
round trip. Elasticsearch
remains a derived read model (ADR-0009) — it is read for search and nothing
else, and is rebuildable from MongoDB. The trade-off is that a lagging index
serves slightly stale content; acceptable for a search result, and named in the
README.

**No search pagination.** `limit` only, capped at 100. The spec asks for
pagination on the listing endpoint, not on search. Deep relevance paging needs
`search_after`; the README names that rather than half-building it.

### Elasticsearch mapping — explicit, and `metadata` is the point

```json
{
  "dynamic": "strict",
  "properties": {
    "tenantId":       { "type": "keyword" },
    "conversationId": { "type": "keyword" },
    "senderId":       { "type": "keyword" },
    "timestamp":      { "type": "date" },
    "content":        { "type": "text", "analyzer": "standard" },
    "metadata":       { "type": "object", "enabled": false }
  }
}
```

**There is no `id` field, deliberately.** ADR-0011 already makes the document id
the message id, so a copy in `_source` is a second value nothing keeps in sync.
The adapter composes the view from both halves of the hit:

```ts
hits.map((h) => ({ id: h._id, ...h._source }))   // -> MessageView (ADR-0020)
```

**`dynamic: strict`** makes an unexpected top-level field a hard error rather
than a quiet mapping addition — the same failure `metadata`'s `enabled: false`
exists to prevent, closed at the root as well. Strictness does not reach inside
`metadata`: `enabled: false` means its content is never parsed at all.

`metadata` is `Record<string, any>` with client-controlled keys. Under dynamic
mapping, one tenant posting varied metadata keys grows the cluster-state mapping
until the index is unusable. `enabled: false` keeps it in `_source`, so it still
comes back in results, while indexing none of it. This is the concrete reason the
spec asks for explicit mappings, and it belongs in the README.

`standard` over `english`: stemming helps English recall and quietly damages
everything else, and this is a general chat corpus.

Single index, tenant filtered — not an index per tenant (ADR-0012 trade-off).
Created at startup with the mapping if absent.

### Domain errors map to two statuses

| Error | Status | Why |
| --- | --- | --- |
| `BlankContentError` | 400 | content sanitized away to nothing |
| `InvalidCursorError` | 400 | malformed base64 or shape |
| `CursorDirectionError` | 400 | a `desc` cursor presented with `sort=asc` |
| `MissingIdentityError` | 500 | unreachable over HTTP — the guard guarantees it |
| anything else | 500 | logged; the message is not echoed to the client |

Input faults get the same 400 the DTO would have returned, so a client sees one
status for one class of problem regardless of which layer caught it. A missing
identity context is deliberately **not** a 401: the guard has already run, so
reaching it means a bug in our wiring, and dressing that as an auth failure sends
the caller off to check a token that was fine.

### Cross-tenant reads are empty, not 404

Tenant scoping is part of the query (ADR-0012), so another tenant's conversation
simply does not exist from this caller's perspective:

```
GET /api/conversations/abc/messages     token: tenant B, conversation abc: tenant A
200 { "items": [], "nextCursor": null }  — identical to a conversationId that never existed
```

Nothing is special-cased and nothing leaks. A 404 would require an existence
check the design has no other reason to run, and would confirm that *some* tenant
owns that `conversationId` — a cross-tenant existence oracle, which is precisely
what tenant isolation exists to withhold.

## 4. The event pipeline

```
CreateMessage --> KafkaEventPublisher --> topic: message-created (3 partitions)
                  acks: all, idempotent     key: `${tenantId}:${conversationId}`
                                                   |
                       group: search-indexer  <-----+
                  MessageCreatedConsumer --> IndexMessage --> ES index (id = message.id)
```

- **The topic is created explicitly at startup** through the kafkajs admin
  client. Kafka's auto-create yields a single partition, which would silently
  erase the partitioning design the spec grades. The topology is asserted, not
  inherited from a broker default.
- **Producer: `idempotent: true`, `acks: all`.** One flag removes
  duplicate-on-retry at the producer. The consumer-side idempotency of ADR-0011
  stands regardless, since it covers redelivery rather than only retries.
- **Offsets commit only after indexing resolves.** kafkajs commits after
  `eachMessage` returns, so a throw means no commit and redelivery, which the
  `id`-keyed upsert makes a no-op. No manual commit code is needed; what is
  needed is *not* catching-and-continuing inside the handler, which would commit
  past a failure.
- **The consumer reads the tenant from the payload**, never from ALS.
- Lifecycle on `onModuleInit` / `onModuleDestroy`, with `enableShutdownHooks()`
  so SIGTERM leaves the consumer group cleanly instead of waiting out the
  session timeout.
- Topic name, partition count and group id live in configuration, not in string
  literals (ADR-0010).

**No dead-letter queue.** When retries exhaust, the consumer stops rather than
skipping the message. Named in the README: a poison message halting the indexer
is a visible failure, where skipping it is silent data loss in a derived index.

**And "visible" has to be built, not asserted.** In one process a halted consumer
would otherwise leave the API returning 201s while search quietly stops updating
— exactly as silent as the skipping it was preferred over. The consumer records
its own liveness and the health route reports it:

```
GET /health -> 200 { status: 'ok',       indexer: 'running' }
            -> 503 { status: 'degraded', indexer: 'stopped',
                     reason: 'consumer crashed' }
```

```ts
this.consumer.on('consumer.crash', (e) => {
  this.state = 'stopped';
  this.logger.error('indexer halted', e);
});
```

Hand-rolled. `@nestjs/terminus` is an official Nest package but would be a
dependency carried for one boolean. This is also what gives the `@Public()`
health route a purpose beyond "the process is up".

**Process boundary: one process.** The consumer starts inside the API process on
bootstrap. One command to run, one to demo, and integration tests exercise the
whole pipeline in a single Nest testing module. The cost — the API and the
indexer cannot scale independently — is named in the README; the consumer group
is already in place, so splitting the entrypoint later is a bootstrap change, not
a redesign.

## 5. Testing

TDD throughout (ADR-0014): failing test first, confirmed failing, then the
minimal code to pass.

### Unit — no infrastructure, every port faked

- `Message.create` invariants — blank content, and content the sanitize pipe
  reduced to nothing before it arrived
- `Message.create` clock coherence — the id's embedded millisecond equals
  `timestamp` (Jest fake timers)
- `Cursor` round-trip, malformed input, direction mismatch
- `CreateMessage` — save precedes publish; a publish rejection still returns the
  message
- `ListMessages` — the `limit + 1` row becomes `nextCursor` and is not returned
  as an item
- `SearchMessages`
- `IndexMessage`

Fakes honour the same contract as the real adapters — same errors, same
ordering, no stricter preconditions (ADR-0006, Liskov).

### Integration — compose stack, Nest testing module, supertest

| Area | Cases |
| --- | --- |
| Auth | absent, malformed, expired token; token missing `tid`; missing `sub`; `senderId` in body -> 400 |
| Create | 201 shape; blank and whitespace `content` -> 400 (DTO); script-only content -> 400 (`Message.create`, after sanitization); oversized `content`; oversized `metadata`; markup content stored sanitized |
| List | ordering; paging across a page boundary; `limit=0`/`101`/`abc` -> 400; malformed cursor -> 400; `desc` cursor with `sort=asc` -> 400; `sort=asc` and `sort=desc`; tenant B gets `200 { items: [] }` for tenant A's conversation |
| Index | `explain()` gives `IXSCAN` with no `SORT`; ids generated in the same millisecond keep a stable total order |
| Search | hit found after refresh; empty result -> `200 { items: [] }`; cross-tenant filtered out |
| Consumer | the same event consumed twice -> one document, identical state |
| Health | `200 ok` while the indexer runs; `503 degraded` once it has stopped |

Three mechanics fixed now rather than discovered later:

- **The test keypair is generated in Jest global setup**, never committed — not
  even as a fixture (ADR-0018).
- **Each integration run uses a fresh random `tenantId`**, which turns
  ADR-0014's "compose state persists between runs" limitation into a non-issue
  for about three lines.
- **Integration tests run serially, in their own Jest project, under a random
  consumer group id.** Jest runs test files in parallel workers by default, and
  slice 4 puts a Kafka consumer inside the app — so every integration file would
  boot another consumer into the same group, rebalancing mid-test and shuffling
  partitions between workers. `maxWorkers: 1` means one consumer exists at a
  time; the random group id keeps a previous run's committed offsets out of this
  one. Unit tests stay parallel and infrastructure-free.

```js
// jest.config
projects: [
  { displayName: 'unit',        testMatch: ['**/*.spec.ts'] },
  { displayName: 'integration', testMatch: ['**/*.int-spec.ts'],
    maxWorkers: 1, globalSetup: './test/setup.ts' },   // keypair + run ids
]
```

Both projects still run under one `nub run test`.

Search assertions poll until the document appears or a timeout expires — never a
bare sleep, never an assertion immediately after the POST (ADR-0009).

## 6. Build slices

Vertical slices, endpoint by endpoint. Every slice ends with `nub run test` and
`nub run lint` green, and exactly one commit.

| # | Slice | Done when |
| --- | --- | --- |
| 0 | Skeleton — hand-written `main.ts`/`app.module.ts`, tsconfig decorator flags, TypeScript pinned to `^5.9`, two Jest projects, ESLint layering zones, env validation, docker-compose, `@Public()` health route, Swagger | app boots, health responds, lint zones fail on a deliberate bad import |
| 1 | Auth — JWT strategy, global guard, ALS identity adapter + interceptor, `auth:keygen` script | every auth rejection case is green |
| 2 | Create -> Mongo — entity, UUIDv7, mapper, repository, `createIndexes`, DTO, controller, exception filter | POST returns 201 and the document is in Mongo with a Binary `_id` |
| 3 | List — cursor, keyset reader, `explain()` check | paging across a boundary is stable; `explain()` shows `IXSCAN` with no `SORT` |
| 4 | Pipeline — publisher, topic admin, consumer, ES mapping, indexer, indexer liveness on `/health` | a POSTed message appears in the index; a replayed event changes nothing; a halted indexer turns `/health` 503 |
| 5 | Search endpoint | search returns hits, empty results, and no cross-tenant documents |
| 6 | README — setup, API contract, architecture decisions, `explain()` output, trade-offs | every deferral in ADR-0017 and ADR-0011 is named with its reasoning |

Slice 0 carries `docker-compose.yml` and a connectivity smoke test so that the
riskiest infrastructure surprises surface early, even though the code that uses
Kafka and Elasticsearch arrives in slice 4.

## Out of scope

Unchanged from ADR-0017 and confirmed here: no caching, no rate limiting, no
refresh-token flow, no users collection, no roles, no dead-letter queue, no
transactional outbox, no `search_after` deep paging. Each is named in the README
with its reasoning and, where ADR-0017 ranks them, its rank.
