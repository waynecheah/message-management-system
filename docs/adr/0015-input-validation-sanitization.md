---
title: ADR-0015 - Input validation at the boundary and sanitization against stored XSS
description: ValidationPipe with whitelisting, plus sanitize-html on content; never interpolate input into queries
---

# ADR-0015 — Input validation at the boundary and sanitization against stored XSS

## Status

Accepted — 2026-08-13

## Tags

`security` `validation` `nestjs` `dto`

## Decision

- Validate every input **at the boundary** with DTOs and Nest's `ValidationPipe`
  configured `whitelist: true, forbidNonWhitelisted: true`.
- Sanitize `content` with `sanitize-html` before persisting.
- **Never interpolate user input** into MongoDB queries or Elasticsearch query
  strings — parameterized/DSL forms only.

## Why

**Validation belongs at the edge so the domain can assume validity.** If DTOs
guarantee shape and type, entities enforce only genuine business invariants
rather than re-checking for null. This is what keeps the domain layer thin and
meaningful ([ADR-0016](0016-thin-domain-model.md)).

**`whitelist` + `forbidNonWhitelisted` is the part that matters.** Validation
that only checks declared fields still lets undeclared ones through to the
persistence layer — mass-assignment. Whitelisting strips them; forbidding
rejects the request outright. Given [ADR-0012](0012-multi-tenancy.md), a
client-supplied `tenantId` slipping into a document write is precisely the
attack this closes.

**Stored XSS is the realistic threat for a message system.** `content` is
attacker-controlled, persisted, and later rendered by some consumer. Sanitizing
on write is the one point we control.

**Query interpolation.** MongoDB operator injection (`{ $ne: null }` arriving
where a string was expected) and Elasticsearch `query_string` injection are both
live risks when input reaches a query unparsed. `class-validator` type
enforcement plus DSL-form queries closes both.

## Trade-offs

- **Sanitizing on write is lossy and irreversible.** The original input is not
  recoverable. Sanitizing on read would preserve it, but leaves the raw payload
  in the database for any other consumer to mishandle. We chose write-time for a
  system whose consumers we do not control.
- **`sanitize-html` is an added dependency**, against the default bias of
  [ADR-0003](0003-nub-toolchain.md)'s minimalism. Justified by the spec's
  explicit "validate and sanitize inputs" requirement.
- Sanitization does not make `content` safe for every sink — it targets HTML
  rendering. It is not an escape for SQL, shell, or template contexts.

## How it works

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

Domain errors thrown below the boundary map to HTTP status codes in a Nest
exception filter, keeping the domain free of HTTP concepts
([ADR-0005](0005-ddd-layering.md)).

### Environment variables — validated at boot, with `class-validator`, not Joi

Configuration is validated when the process starts, through `@nestjs/config`'s
`validate` hook: an `EnvConfig` class carrying `class-validator` decorators,
checked with `plainToInstance` then `validateSync`. A missing or malformed
variable stops the boot.

**Joi is deliberately not used.** It is what the NestJS docs reach for, but it
would be a *second* validation library doing a job the first already does —
buying a slightly terser schema in exchange for a duplicate dependency and two
mental models for "validate this shape". Roughly 25 lines with `class-validator`
against 12 with Joi; we take the ceremony and keep one idiom.

**Boot-time validation itself is not optional**, and matters more since
[ADR-0018](0018-jwt-authentication.md) moved to ES256: `JWT_PUBLIC_KEY` is a PEM
that must parse. Absent or malformed, the process must refuse to start rather
than boot cleanly and fail on the first authenticated request with an opaque
error. The same applies to `MONGO_URL`, `KAFKA_BROKERS` and the Elasticsearch
node — fail loudly at startup, not lazily on the first request that needs them.

The `EnvConfig` class lives in the configuration module under
`infrastructure/`. Decorators are acceptable there; they are not on domain
entities ([ADR-0005](0005-ddd-layering.md)).

## Rules for agents

- Every endpoint takes a DTO. No `@Body()` typed as `any` or an inline object.
- Validate the search term and the pagination cursor — both are user input.
- Never build a Mongo filter or an Elasticsearch query by string concatenation.
- Throw typed domain errors, never plain `Error`, for domain failures.
- **Never add `joi`**, or any second validation library. `class-validator`
  covers both request DTOs and environment configuration.
- Never read an environment variable directly with `process.env` outside the
  config module. Consume the validated, typed config object instead — a direct
  read bypasses the boot-time check that makes the guarantee worth anything.

## Bad pattern

```ts
@Post() create(@Body() body: any) { … }                       // unvalidated
es.search({ q: `content:${term}` });                          // query injection
const uri = process.env.MONGO_URL!;                           // unchecked, non-null asserted
```

## Good pattern

```ts
@Post() create(@Body() dto: CreateMessageDto) { … }
es.search({ query: { match: { content: term } } });           // DSL, not string
const uri = config.get('MONGO_URL');                          // validated at boot, typed
```
