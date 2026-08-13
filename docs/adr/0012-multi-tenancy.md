---
title: ADR-0012 - Tenant isolation enforced at the data-access layer, propagated by AsyncLocalStorage
description: Tenant leads every compound index and filters every query; absent tenant is an error
---

# ADR-0012 — Tenant isolation enforced at the data-access layer, propagated by AsyncLocalStorage

## Status

Accepted — 2026-08-13

## Tags

`multi-tenancy` `security` `mongodb` `elasticsearch` `nestjs`

## Decision

Every message, query, index entry and Kafka event carries a tenant identifier.

**Tenant scoping is enforced in the repository/adapter layer**, never left to
callers. A missing tenant context is an error, never a wildcard.

Tenant context is propagated with **`AsyncLocalStorage`**, not with
request-scoped Nest providers.

## Why

**Enforcement location.** If tenant filtering is the caller's job, then every
new query is a fresh opportunity to leak data across tenants, and correctness
depends on nobody ever forgetting. Pushing it into the repository makes the
insecure version impossible to write rather than merely discouraged.

**Fail-closed on absent context.** Treating a missing tenant as "match all" is
the failure mode that turns one forgotten middleware into a full cross-tenant
disclosure. Throwing instead converts it into an obvious, loud bug.

**`AsyncLocalStorage` over `Scope.REQUEST`.** Nest's request-scoped providers are
contagious: scope propagates up the entire dependency chain, so every consumer
of a request-scoped provider is itself instantiated per request. The obvious
`TenantContext` provider would quietly make most of the application
request-scoped and forfeit singleton performance. `AsyncLocalStorage` populated
in middleware gives the same ambient context with singleton providers
throughout.

## Structure / Flow

```
request → JwtAuthGuard: verify token, extract tid/sub claims   (ADR-0018)
             → ALS.run({ tenantId, senderId }, next)
             ↓
        use case (tenant-agnostic)
             ↓
        repository: reads tenantId from ALS, applies it to every filter
```

**Amended 2026-08-13.** This ADR originally resolved the tenant from a request
header in middleware, flagged as unacceptable outside a code test because any
caller could assert any tenant. That mechanism is superseded by
[ADR-0018](0018-jwt-authentication.md): the tenant now comes from a verified JWT
claim. The enforcement below is unchanged — only the trustworthiness of its
input improved.

## How it works

- **MongoDB** — `tenantId` is the **leading field** of every compound index, so
  `(tenantId, conversationId, timestamp)` serves the paginated conversation
  read. Leading placement means the index is usable for tenant-scoped queries;
  putting it last would make it nearly useless.
- **Elasticsearch** — `tenantId` is a filter clause on every query. Filter
  context, not query context: no scoring contribution, and cacheable.
- **Kafka** — the event payload carries the tenant, so the consumer indexes into
  the correct tenant scope without a lookup.

## Trade-offs

- **Shared collection and index, not per-tenant.** Simpler, and correct for this
  scale; a very large tenant cannot be isolated onto its own shard or index
  without revisiting this.
- **Ambient context is implicit.** `AsyncLocalStorage` makes the tenant invisible
  in function signatures, which is the trade for not threading it through every
  call. Any code path that escapes the request lifecycle — a Kafka consumer, a
  scheduled job — has no ambient tenant and must set it explicitly.
- The Kafka consumer is exactly such a path: it reads the tenant from the event
  payload, not from ALS.

## Relationship to other ADRs

- [ADR-0013](0013-keyset-pagination.md) — the compound index shape is shared
  with the pagination decision.
- [ADR-0018](0018-jwt-authentication.md) — supplies the tenant identity, from a
  verified `tid` claim.

## Rules for agents

- Never accept `tenantId` from a request header, body or query parameter. The
  verified token claim is the only source.
- Never write a repository method that can execute without a tenant filter.
- `tenantId` leads every compound index.
- Cross-tenant access attempts are a required test case.

## Bad pattern

```ts
find({ conversationId })                      // no tenant filter — leaks
find({ tenantId: tenantId ?? { $exists: true } })  // absent tenant → wildcard
find({ tenantId: req.headers['x-tenant-id'] })     // caller-asserted identity
```

## Good pattern

```ts
const { tenantId } = tenantContext.require();  // throws when absent
find({ tenantId, conversationId });
```
