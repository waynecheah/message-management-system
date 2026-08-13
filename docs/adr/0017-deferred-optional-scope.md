---
title: ADR-0017 - Deferred scope, ranked - refresh tokens, rate limiting, caching
description: What we chose not to build, why, and the order to build it in if time remains
---

# ADR-0017 — Deferred scope, ranked: refresh tokens, rate limiting, caching

## Status

Accepted — 2026-08-13
**Amended 2026-08-13** — originally covered caching and authentication.
Authentication moved into committed scope
([ADR-0018](0018-jwt-authentication.md)); a stateful **refresh-token flow** took
its place, **rate limiting** was added, and the three items are now ranked.

## Tags

`scope` `caching` `authentication` `refresh-tokens` `rate-limiting` `timebox`

## Decision

Three items are deferred. None is in committed scope. If time remains after the
graded core is green, build them **in this order**:

1. **Stateful refresh tokens** — preferred stretch goal.
2. **Rate limiting** — second.
3. **Caching** — third.

The graded core is: DDD boundaries, the Kafka topology, Mongo and Elasticsearch
indexing, multi-tenancy, the test suite, and the README.

## Why

**Why deferred at all.** All three are optional — caching is optional in the
spec, and rate limiting is not mentioned in it at all — while the graded core
consumes the timebox. Half-finished work scores worse than a documented absence,
and for the two security items the asymmetry is sharper: a reviewer reads a
broken refresh flow or a misconfigured limiter as a security bug rather than an
incomplete feature.

**Why refresh ranks first.** It closes a limitation we have already written
down — [ADR-0018](0018-jwt-authentication.md) records that stateless tokens
cannot be revoked. A stateful store makes revocation possible, and rotation adds
theft detection. It also demonstrates a **third distinct indexing skill** (a TTL
index) alongside the compound and search indexes.

**Why rate limiting ranks above caching.** It adds a security control that is
genuinely absent, where caching optimizes something that keyset pagination
([ADR-0013](0013-keyset-pagination.md)) and a correct compound index
([ADR-0012](0012-multi-tenancy.md)) may already have made fast enough — and
adding a cache first would hide whether that index work was any good.

## How it works — refresh tokens, if implemented

**The structural catch:** a refresh token presupposes an original
authentication, and [ADR-0018](0018-jwt-authentication.md) deliberately has no
issuance point. Adding refresh therefore makes this service a token *issuer*.
There is no coherent design in which we rotate credentials another system
minted, because signing material would be owned by both.

The minimal coherent version keeps issuance but skips user management:

- **Seeded principals** — a fixture set of tenant/sender pairs with
  high-entropy API keys. No registration, no user management, no user lifecycle.
- **`POST /api/auth/token`** — exchange an API key for an access + refresh pair.
- **`POST /api/auth/refresh`** — exchange a refresh token for a new pair,
  **rotating** the refresh token on every use.
- **`refresh_tokens` collection** — hashed token, principal, tenant, expiry,
  revoked flag.

Two details keep the cost down:

- **SHA-256, not bcrypt or argon2.** The stored value is a 256-bit random token,
  not a low-entropy password, so a fast hash is correct and **no
  password-hashing dependency is needed**. Never store the raw token.
- **Expiry rides a MongoDB TTL index**, so cleanup is automatic rather than a
  scheduled job.

**Rotation gives reuse detection:** a rotated token presented a second time
means it was stolen, so the entire token family is revoked, not just that token.

## How it works — rate limiting, if implemented

`@nestjs/throttler` with an `APP_GUARD`. It looks like a ten-minute add. It is
not, because **both defaults are wrong for this system**:

**Key on the tenant, never the IP.** The default tracker is the client IP.
Behind a load balancer or gateway most traffic arrives from a handful of
addresses, so an IP limit either does nothing or throttles every tenant at once
— one tenant's burst rate-limiting another is a multi-tenancy violation dressed
up as a security feature. Override `getTracker()` to return the tenant from the
ambient context ([ADR-0012](0012-multi-tenancy.md)), which the verified `tid`
claim ([ADR-0018](0018-jwt-authentication.md)) has already established.

**The default store is per-instance.** Counters live in the memory of one
process, so three replicas mean three times the configured limit. A correct
distributed limiter needs a shared store — Redis — which is the same dependency
this ADR defers for caching. Pick one and be honest about it.

The middle path, and what to build if this is attempted: **tenant-keyed tracker,
in-memory store, documented as single-node-only.** About 20 lines. It
demonstrates the tenant dimension, which is the part a reviewer would check, and
states its own limitation rather than pretending to a guarantee it cannot make.

A naive IP-keyed add is worse than nothing here: anyone who understands
multi-tenancy spots the wrong tracker immediately, and it reads as
pattern-matching rather than judgment.

## How it works — caching, if implemented

`@nestjs/cache-manager` + `cache-manager` is the entry point. An in-memory store
needs no extra store package and is defensible for a single-node deployment.

Be aware the Redis store adapter naming churned across cache-manager v5 → v6
(Keyv-based now) — **check the current NestJS caching docs rather than trusting
a remembered package name.**

## Known limitations

- The submission demonstrates no revocation story, no abuse protection, and no
  caching strategy in code. The README compensates by naming all three, with the
  reasoning and the ranking.
- Access tokens remain irrevocable until expiry for as long as this stays
  deferred — mitigated only by short lifetimes.
- **The API is unprotected against abuse.** Nothing bounds how fast an
  authenticated tenant can create messages, and the search endpoint is the
  expensive one to hammer. Authentication limits *who* can do it, not *how much*.
- For caching, the obvious candidate is the conversation listing, invalidated on
  write.

## Rules for agents

- Do not add a caching dependency, a rate-limiting dependency, an auth issuance
  endpoint, or a refresh-token store without an explicit instruction. Deferred
  means deferred.
- Do not start any stretch goal while any part of the graded core is incomplete
  or any test is failing. Follow the ranking; do not cherry-pick the easiest.
- If refresh tokens are built: never store a raw refresh token, always rotate on
  use, and revoke the whole family on reuse.
- If rate limiting is built: key on the tenant, never the client IP. Do not
  claim a distributed guarantee while using the in-memory store.
- If caching is built: every cache key must be tenant-scoped. A tenant-blind key
  is a cross-tenant leak that bypasses the repository-layer enforcement in
  [ADR-0012](0012-multi-tenancy.md).
- Justify any of them in the README by the specific problem it solves — not "for
  performance" or "for security".

## Consequences

The README's trade-offs section names all three deferrals and the ranking,
alongside the transactional outbox from
[ADR-0011](0011-delivery-guarantees-idempotency.md). A deferral stated with its
reasoning reads as judgment; an unmentioned one reads as an oversight.
