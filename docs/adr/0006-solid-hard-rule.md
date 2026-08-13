---
title: ADR-0006 - SOLID as a hard rule, with token-based dependency injection
description: All five principles are binding; DIP is implemented through Nest symbol tokens
---

# ADR-0006 — SOLID as a hard rule, with token-based dependency injection

## Status

Accepted — 2026-08-13

## Tags

`architecture` `solid` `dependency-injection` `nestjs`

## Decision

All five SOLID principles are binding on every class, with no exemption for
timebox pressure. Dependency inversion is implemented with **Symbol tokens** and
constructor injection.

## Why

The spec grades SOLID explicitly. Beyond the rubric, DIP is what makes the
layering in [ADR-0005](0005-ddd-layering.md) real rather than decorative — and
NestJS is unusually well-suited to it, since it ships a genuine IoC container.
That is rare in Node; Express and Fastify offer nothing comparable, and
hand-rolling means adding `tsyringe` or `inversify`.

## How it works

TypeScript interfaces do not exist at runtime, and Nest resolves dependencies
from emitted metadata. An `interface` emits nothing, so a port costs three
parts:

```ts
export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');   // token
export interface MessageRepository { /* … */ }                     // contract
{ provide: MESSAGE_REPOSITORY, useClass: MongoMessageRepository }  // binding
```

Consumed as:

```ts
constructor(
  @Inject(MESSAGE_REPOSITORY) private readonly repo: MessageRepository,
) {}
```

### The five, as applied here

- **S** — One class, one reason to change. A controller parses and responds; a
  use case orchestrates; an entity holds invariants; a repository persists; an
  adapter talks to one external system. If you cannot name a class's job in one
  sentence without "and", split it.
- **O** — Extend by adding a type, not by editing a switch. No `if (type === …)`
  chains over domain concepts.
- **L** — The fake repository in unit tests must honour the same contract as the
  Mongo one: same errors, same ordering guarantees, no stricter preconditions.
  A subclass that throws "not supported" means the abstraction is wrong.
- **I** — Narrow, role-specific ports. A read path that only lists messages
  depends on a list-messages port, not a fat `MessageRepository` also exposing
  write, delete and index.
- **D** — Domain and application define the interfaces; infrastructure
  implements them. Never `new SomeMongoClient()` inside a use case.

## Trade-offs

**The token and the type annotation are checked by nobody.** Mismatch
`@Inject(MESSAGE_REPOSITORY)` with the wrong interface and you get a runtime
resolution failure, not a compile error. This is the standing tax of DI in
TypeScript.

**The tax compounds with ISP.** More, narrower ports means more tokens and more
module wiring ceremony. We accept the verbosity; it is the price of the
testability.

## Consequences — checks before committing

- Could you swap Elasticsearch for another search backend by adding one adapter
  class and changing one module binding? If not, DIP or OCP is broken.
- Can every use case be unit tested with no Mongo, Kafka or Elasticsearch
  running? If not, DIP is broken.

## Bad pattern

```ts
class CreateMessage {
  private repo = new MongoMessageRepository(client);   // concrete, untestable
}
```

## Good pattern

```ts
class CreateMessage {
  constructor(@Inject(MESSAGE_REPOSITORY) private readonly repo: MessageRepository) {}
}
```
