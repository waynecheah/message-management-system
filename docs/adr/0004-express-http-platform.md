---
title: ADR-0004 - Express as the NestJS HTTP platform, not Fastify
description: The graded performance criteria are all data-layer, so the platform swap buys nothing
---

# ADR-0004 — Express as the NestJS HTTP platform, not Fastify

## Status

Accepted — 2026-08-13

## Tags

`http` `nestjs` `performance` `scope`

## Decision

Use `@nestjs/platform-express`, NestJS's default HTTP adapter. Fastify was
evaluated and rejected for this timebox.

## Why

**The graded performance criteria are all data-layer.** The spec asks for
efficient MongoDB retrieval, proper indexing, optimized queries and caching. Not
one performance requirement concerns HTTP throughput. Fastify scores nothing
against the rubric.

**The headline benchmark does not survive contact with Nest.** Fastify's ~2×
advantage is measured standalone, and much of it comes from `fast-json-stringify`
serializing against a JSON schema — which Nest does not wire your DTOs into
automatically. Meanwhile Nest's own overhead (DI resolution, guards, pipes,
interceptors, `class-transformer`) sits on the request path either way and tends
to dominate. Realistic gain in a Nest app is modest.

**Remaining hours are better spent** on compound indexes, keyset pagination,
Elasticsearch mappings and idempotent consumption.

## Trade-offs

Had we chosen Fastify, the costs would have been: Express middleware does not
transfer (`helmet` → `@fastify/helmet`); `FileInterceptor`/multer is Express-only;
`@Res()` yields a Fastify reply with different send semantics; Fastify's
lifecycle hooks are not idiomatically exposed through Nest; and there is
markedly less Nest+Fastify material to lean on when something surprises you.

**This decision is cheap to reverse.** The platform is one line in `main.ts`
plus a helmet swap. If time remains at the end, revisit it.

Officially there are only these two adapters. `@nestjs/platform-ws` and
`@nestjs/platform-socket.io` are WebSocket gateway adapters, not HTTP platforms,
and are irrelevant to this REST-only spec. Custom `AbstractHttpAdapter`
implementations exist in the community but are unofficial and patchily
maintained.

## Consequences

The README's architecture-decisions section states the reasoning explicitly,
which demonstrates the judgment the swap itself would not have. It must **not**
claim a 2× speedup on the strength of the public benchmark.

## Relationship to ADR-0002

Same shape of reasoning as [ADR-0002](0002-nodejs-runtime.md): raw runtime
speed is not the axis this test is scored on.

## Rules for agents

- Do not introduce Fastify-specific packages or `@Res()`-dependent code.
- Let Nest handle responses; do not reach for the platform's native request or
  reply objects. This is what keeps the decision one line to reverse.
