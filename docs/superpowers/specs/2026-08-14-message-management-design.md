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

Four questions the ADRs did not settle, resolved here:

| Question | Decision |
| --- | --- |
| Search read path | Return the Elasticsearch `_source` directly; do not hydrate from MongoDB |
| Sorting surface | `sort=asc\|desc` on `timestamp` only, both directions of the same keyset |
| Consumer process boundary | Same process as the API, started on bootstrap |
| Build strategy | Vertical slices, endpoint by endpoint, with the compose stack in slice 0 |

Rationale for each is in the section it governs.

## 1. Module and layer map

```
src/
  main.ts                    ValidationPipe(whitelist, forbidNonWhitelisted, transform),
                             exception filter, Swagger, enableShutdownHooks, listen
  app.module.ts              module wiring + APP_GUARD (global JwtAuthGuard)

  domain/                    imports nothing from the other three layers
    message.ts               entity — private ctor, static create(), immutable
    message-created.event.ts event payload
    cursor.ts                (timestamp, id, direction) — encode/decode, rejects malformed
    page.ts                  Page<T> { items, nextCursor }
    errors.ts                DomainError + typed subclasses
    uuid-v7.ts               v7 generator (node:crypto randomBytes; NOT randomUUID)
    ports/
      message-writer.port.ts       save(message)
      message-reader.port.ts       listByConversation(...) : Page<Message>
      message-searcher.port.ts     search(...) : Message[]
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
repository. **Action: add a dated amendment note to ADR-0012** recording the
rename and the widened shape. Enforcement is unchanged — a missing context still
throws, and is never a wildcard.

### Sanitization sits in the DTO

`sanitize-html` runs in a `class-transformer` `@Transform` on the create DTO, not
in the use case. Sanitization is a boundary concern (ADR-0015); running it in
`application/` would make it something the domain has to trust rather than
assume.

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

### Content is checked twice, deliberately

`sanitize-html` can reduce `<script>alert(1)</script>` to the empty string, so
sanitization *creates* the blank-content case rather than only passing it
through. The DTO rejects blank content and `Message.create` also refuses it. The
second check is the entity's one genuine invariant (ADR-0016), not redundancy.
Both get a test.

### Bounds

| Field | Bound |
| --- | --- |
| `content` | non-blank, <= 4000 characters |
| `conversationId` | non-blank, <= 128 characters |
| `metadata` | optional object |

Oversized content is a required edge case (ADR-0014), so the limit is a stated
number rather than an implicit one.

### The event carries the whole message

The payload is the full message, not just the id. The consumer then indexes
without reading back from MongoDB — no read-your-write race against the primary,
and the consumer needs no tenant context of its own, which matters because it
runs outside the request lifecycle and has no ambient tenant (ADR-0012).

### Publish failure returns 201

The message is in the system of record, so the request succeeded. Failing it
would invite a client retry that writes a second message under a new id. The
failure is logged at error level and never swallowed (ADR-0011). The cost — that
message is absent from search until a backfill — is the write-then-publish gap
that ADR-0011 already accepts, and it is named in the README beside the
transactional-outbox note.

## 3. The read paths

### List

```
GET /api/conversations/:conversationId/messages?limit=&sort=&cursor=

limit   default 20, max 100          sort  asc | desc (default desc)
cursor  base64url of (timestamp, id, direction) — opaque, parsed defensively

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
- **One index serves both directions:**
  `(tenantId: 1, conversationId: 1, timestamp: -1, _id: -1)`. MongoDB walks an
  index backwards at the same cost, so `asc` needs no second index. `_id` is the
  fourth field so the tiebreaker sorts in the index rather than in memory.
  Verified with `explain()`: `IXSCAN`, no `SORT` stage. The output goes in the
  README.

### Search

```
GET /api/conversations/:conversationId/messages/search?q=&limit=

ES:  bool {
       must:   [ { match: { content: q } } ],        scored
       filter: [ { term: { tenantId } },             filter context — unscored, cacheable
                 { term: { conversationId } } ]
     }
-> 200 [ ...messages from _source, relevance order ]
```

`match` against a DSL object — never `query_string`, never string concatenation
(ADR-0015). `q` is validated: non-blank, <= 256 characters. An empty result is a
`200 []`, which is a required edge case.

**Returning `_source` directly** keeps search to one round trip. Elasticsearch
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
  "tenantId":       { "type": "keyword" },
  "conversationId": { "type": "keyword" },
  "senderId":       { "type": "keyword" },
  "timestamp":      { "type": "date" },
  "content":        { "type": "text", "analyzer": "standard" },
  "metadata":       { "type": "object", "enabled": false }
}
```

`metadata` is `Record<string, any>` with client-controlled keys. Under dynamic
mapping, one tenant posting varied metadata keys grows the cluster-state mapping
until the index is unusable. `enabled: false` keeps it in `_source`, so it still
comes back in results, while indexing none of it. This is the concrete reason the
spec asks for explicit mappings, and it belongs in the README.

`standard` over `english`: stemming helps English recall and quietly damages
everything else, and this is a general chat corpus.

Single index, tenant filtered — not an index per tenant (ADR-0012 trade-off).
Created at startup with the mapping if absent.

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

- `Message.create` invariants, including sanitize-to-empty content
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
| Create | 201 shape; blank and whitespace `content`; oversized `content`; script content stored sanitized |
| List | ordering; paging across a page boundary; `limit` out of bounds; malformed cursor; `sort=asc` and `sort=desc`; tenant B cannot read tenant A's conversation |
| Search | hit found after refresh; empty result -> `200 []`; cross-tenant filtered out |
| Consumer | the same event consumed twice -> one document, identical state |

Two mechanics fixed now rather than discovered later:

- **The test keypair is generated in Jest global setup**, never committed — not
  even as a fixture (ADR-0018).
- **Each integration run uses a fresh random `tenantId`**, which turns
  ADR-0014's "compose state persists between runs" limitation into a non-issue
  for about three lines.

Search assertions poll until the document appears or a timeout expires — never a
bare sleep, never an assertion immediately after the POST (ADR-0009).

## 6. Build slices

Vertical slices, endpoint by endpoint. Every slice ends with `nub run test` and
`nub run lint` green, and exactly one commit.

| # | Slice | Done when |
| --- | --- | --- |
| 0 | Skeleton — restructured `nest new`, ESLint layering zones, env validation, docker-compose, `@Public()` health route, Swagger | app boots, health responds, lint zones fail on a deliberate bad import |
| 1 | Auth — JWT strategy, global guard, ALS identity adapter, `auth:keygen` script | every auth rejection case is green |
| 2 | Create -> Mongo — entity, UUIDv7, mapper, repository, `createIndexes`, DTO, controller, exception filter | POST returns 201 and the document is in Mongo with a Binary `_id` |
| 3 | List — cursor, keyset reader, `explain()` check | paging across a boundary is stable; `explain()` shows `IXSCAN` with no `SORT` |
| 4 | Pipeline — publisher, topic admin, consumer, ES mapping, indexer | a POSTed message appears in the index; a replayed event changes nothing |
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
