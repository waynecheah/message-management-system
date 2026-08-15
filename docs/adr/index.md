---
title: Content - [ ADR Index ]
description: Overview of documents in ADRs
---

Before generating code, find relevant ADRs by keyword and read them.

## Foundations

| ADR | Decision | Keywords |
| --- | --- | --- |
| [0001](0001-documentation-split.md) | Documentation split across `CLAUDE.md`, `CONTEXT.md` and ADRs | documentation, process, agent-guidance |
| [0002](0002-nodejs-runtime.md) | Node.js as the runtime, not Bun | runtime, stack, spec-compliance |
| [0003](0003-nub-toolchain.md) | `nub` as the sole Node.js toolkit | toolchain, package-manager |
| [0004](0004-express-http-platform.md) | Express as the NestJS HTTP platform, not Fastify | http, nestjs, performance |

## Architecture

| ADR | Decision | Keywords |
| --- | --- | --- |
| [0005](0005-ddd-layering.md) | DDD layering with enforced import boundaries | architecture, ddd, layering, lint |
| [0006](0006-solid-hard-rule.md) | SOLID as a hard rule, token-based DI | solid, dependency-injection |
| [0016](0016-thin-domain-model.md) | Keep the domain model honestly thin | ddd, domain-model, scope |
| [0020](0020-read-model-separate-from-entity.md) | Read ports return a `MessageView` projection, not the entity | ddd, cqrs, ports, read-model |

## Persistence

| ADR | Decision | Keywords |
| --- | --- | --- |
| [0007](0007-mongodb-native-driver.md) | MongoDB native driver, no Mongoose or ODM | mongodb, persistence |
| [0008](0008-uuid-primary-key.md) | UUIDv7 as `_id` (BSON Binary subtype 4), never `ObjectId` | mongodb, identity, uuid |
| [0009](0009-mongodb-system-of-record.md) | MongoDB is the system of record, Elasticsearch is derived | mongodb, elasticsearch, cqrs |
| [0013](0013-keyset-pagination.md) | Keyset (cursor) pagination, not `skip`/offset | mongodb, pagination, performance |

## Messaging

| ADR | Decision | Keywords |
| --- | --- | --- |
| [0010](0010-kafka-client-and-topology.md) | `kafkajs` directly, not `@nestjs/microservices`; partition by conversation | kafka, eda, messaging |
| [0011](0011-delivery-guarantees-idempotency.md) | At-least-once delivery with idempotent indexing | kafka, reliability, idempotency |

## Cross-cutting

| ADR | Decision | Keywords |
| --- | --- | --- |
| [0018](0018-jwt-authentication.md) | Stateless ES256 JWT verification, algorithm pinned; tenant and sender from claims | security, authentication, jwt, es256 |
| [0012](0012-multi-tenancy.md) | Tenant isolation at the data layer, propagated by `AsyncLocalStorage` | multi-tenancy, security |
| [0015](0015-input-validation-sanitization.md) | Boundary validation and sanitization against stored XSS | security, validation, dto |
| [0014](0014-testing-strategy.md) | TDD; mocked ports for units, docker-compose for integration | testing, tdd, infrastructure |
| [0019](0019-api-documentation.md) | OpenAPI docs via `@nestjs/swagger` with the CLI plugin | documentation, openapi, swagger |
| [0017](0017-deferred-optional-scope.md) | Deferred scope, ranked: refresh tokens, rate limiting, caching | scope, refresh-tokens, rate-limiting, caching, timebox |
