---
title: ADR-0005 - DDD layering with mechanically enforced import boundaries
description: Four layers with inward-pointing dependencies, enforced by ESLint rather than good intentions
---

# ADR-0005 — DDD layering with mechanically enforced import boundaries

## Status

Accepted — 2026-08-13

## Tags

`architecture` `ddd` `layering` `lint`

## Decision

Four layers, dependencies pointing inward only:

```
interfaces/      controllers, DTOs, exception filters
    ↓
application/     use cases, orchestration
    ↓
domain/          entities, value objects, domain errors, ports
    ↑
infrastructure/  Mongo, Kafka, Elasticsearch adapters (implements domain ports)
```

`domain/` imports nothing from `infrastructure/`. The boundary is enforced by an
ESLint `import/no-restricted-paths` rule, not by convention.

## Why

The spec grades DDD adherence directly. More practically, the boundary is what
makes every use case unit-testable with no Mongo, Kafka or Elasticsearch
running — which is the difference between a test suite that runs in a second and
one that needs docker-compose up.

**Enforcement is the substantive half of this decision.** Nest modules are DI
scoping units, not architectural boundaries; nothing in the framework stops
`domain/` importing a Mongo driver. An unenforced layering rule degrades on the
first deadline. A lint rule fails the build.

## How it works

`domain/` declares ports as TypeScript interfaces. `infrastructure/` implements
them. Nest binds implementation to token in a module — see
[ADR-0006](0006-solid-hard-rule.md) for the token mechanics.

### This structure is imposed, not provided

**NestJS ships nothing like it.** `nest new` generates a flat `src/` —
`main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts` — and
`nest g resource messages` generates a *feature-module* shape:

```
src/messages/
  dto/            create-message.dto.ts …
  entities/       message.entity.ts
  messages.controller.ts
  messages.service.ts          ← a transaction script, not a domain layer
  messages.module.ts
```

Controller → Service → Entity in one folder. No `domain/`, no `application/`,
no `infrastructure/`, no `interfaces/`. We create those four directories
ourselves, and the lint zones below enforce a convention we invented.

**Therefore: do not use `nest g resource` or `nest g service`.** They are a trap
rather than a shortcut here — they generate code that violates this layering,
and because the output lands outside the configured zones the boundary rule may
not even complain. Create files by hand in the correct layer.

**Amended 2026-08-14.** This ADR originally allowed `nest new` for the initial
skeleton, to be restructured afterwards. It is now excluded too: the scaffolder
selects its own package manager and emits npm-flavoured scripts, which
[ADR-0003](0003-nub-toolchain.md) forbids, and everything it generates is either
discarded or moved. The skeleton is written by hand — `nub add` for the Nest
packages, then `main.ts` and `app.module.ts` created directly in the layers
below. **No Nest scaffolder is run at any point.**

### Layer-first, not feature-first

DDD codebases often nest layers inside each bounded context
(`src/messages/{domain,application,…}`), which scales better across many
contexts and keeps a feature's code together.

We use layer-first at the top level because
[ADR-0016](0016-thin-domain-model.md) commits to a single thin aggregate — there
is only ever one context to hold, so feature-first would add a directory level
that separates nothing. If a second bounded context ever appears, this should be
revisited, and the lint zones would need path globs (`./src/*/domain`) rather
than the fixed paths below.

### The lint boundary

The rule is `import/no-restricted-paths` from `eslint-plugin-import`, with one
zone per forbidden direction:

```js
'import/no-restricted-paths': ['error', {
  zones: [
    { target: './src/domain',      from: './src/application' },
    { target: './src/domain',      from: './src/infrastructure' },
    { target: './src/domain',      from: './src/interfaces' },
    { target: './src/application', from: './src/infrastructure' },
    { target: './src/application', from: './src/interfaces' },
  ],
}],
```

Note the first zone: `domain/` may not import from `application/` either. The
domain sits at the centre and imports from **none** of the other three, not
merely from infrastructure.

Toolchain: `eslint`, `@typescript-eslint/parser`,
`@typescript-eslint/eslint-plugin`, `eslint-plugin-import`, plus `prettier` and
`eslint-config-prettier` so formatting never fights the linter. If flat-config
friction appears with `eslint-plugin-import`, `eslint-plugin-import-x` is the
maintained fork with better flat-config and TypeScript support.

**Lint must pass before every commit, and in CI.** A boundary rule nobody runs
is a comment. This is the entire point of the decision: the check has to be able
to fail the build, not merely to exist.

## Trade-offs

**NestJS's grain runs against this.** As above, the scaffolder generates
Controller → Service → Entity in a single feature folder, and nothing in the
framework rewards putting invariants in entities. The discipline — and the
directory structure itself — is supplied entirely by us, which means it is also
ours to keep enforced.

**Decorators leak the framework inward.** `@Injectable()` on a domain service
would contaminate the layer that is supposed to depend on nothing. Our
compromise: entities and value objects are plain classes with no decorators;
only *application* services carry `@Injectable()`. Purer than the Nest default,
cheaper than full framework isolation.

## Relationship to other ADRs

- [ADR-0006](0006-solid-hard-rule.md) — the SOLID rules that give the layers
  their shape.
- [ADR-0007](0007-mongodb-native-driver.md) — dropping the ODM removes the
  biggest source of persistence leakage into the domain.

## Rules for agents

- No file in `domain/` or `application/` may import from `infrastructure/`, and
  `domain/` may not import from `application/` either. This is a hard failure —
  fix it before proceeding.
- **Never run `nest g resource` or `nest g service`.** They generate a
  feature-module shape that violates this layering. Create files by hand in the
  correct layer.
- **Never disable, weaken, or `eslint-disable` the boundary rule**, and never
  narrow a zone to make a violating import pass. If a boundary is genuinely in
  the way, the design is wrong — change the design or amend this ADR.
- Run lint before every commit; it must pass alongside the tests.
- No decorators on entities or value objects.
- If a use case cannot be unit tested without infrastructure running, the
  layering is broken.

## Bad pattern

```ts
// domain/message.entity.ts
import { Collection } from 'mongodb';        // domain reaching outward
```

## Good pattern

```ts
// domain/ports/message-repository.port.ts
export interface MessageRepository {
  save(message: Message): Promise<void>;
}
// infrastructure/mongo/mongo-message.repository.ts implements it
```
