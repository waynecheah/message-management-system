---
title: ADR-0019 - OpenAPI docs via @nestjs/swagger with the CLI plugin
description: Generate the spec from existing DTOs; no alternative renderer, no contract-first rewrite
---

# ADR-0019 — OpenAPI docs via `@nestjs/swagger` with the CLI plugin

## Status

Accepted — 2026-08-13

## Tags

`documentation` `openapi` `swagger` `nestjs` `dependencies`

## Decision

Generate OpenAPI documentation with **`@nestjs/swagger`**, with its **CLI plugin
enabled**, served at `/api/docs`.

No alternative renderer (Scalar, Redoc, Stoplight). No contract-first rewrite
(`ts-rest`, `nestjs-zod`).

## Why

**It reads what we already have.** The DTOs and `class-validator` decorators
from [ADR-0015](0015-input-validation-sanitization.md) are the same metadata
OpenAPI needs, so the spec is close to free rather than a parallel artefact to
maintain.

**It clears the no-convenience-libraries bar on reviewer value.** The spec does
not ask for API docs at all — the README is the graded deliverable — so this is
a nice-to-have and has to justify itself. It does: a reviewer with limited time
gets a live, executable description of three endpoints and their exact request
and response shapes, which is faster than reading controllers. That is a real
return for one package and about ten lines of setup.

**The CLI plugin removes the usual objection.** The standard complaint about
`@nestjs/swagger` is `@ApiProperty()` on every field. The plugin infers
properties from TypeScript types and existing `class-validator` decorators, so
explicit decorators are needed only for descriptions and examples:

```jsonc
// nest-cli.json
"compilerOptions": { "plugins": ["@nestjs/swagger"] }
```

## How it works

- `SwaggerModule.createDocument` at bootstrap, mounted at `/api/docs`.
- **`addBearerAuth()` is required.** Every endpoint needs a JWT
  ([ADR-0018](0018-jwt-authentication.md)), so without a declared security
  scheme the "try it out" button returns 401 on everything and the docs are
  decorative. With it, a reviewer pastes a token once and can exercise the API.
- OpenAPI decorators live in `interfaces/` only, on DTOs and controllers. They
  are never applied to domain entities — [ADR-0005](0005-ddd-layering.md)
  forbids decorators there, and `@ApiProperty` is as much a framework concern as
  `@Injectable`.

## Trade-offs

- **A dependency for a deliverable nobody asked for.** Justified by reviewer
  value, but it is the weakest justification of any package in this project. If
  time pressure forces a cut, this is the first thing to go.
- **The docs can drift from reality.** The spec is generated from types, not
  from tests, so it describes what the DTOs claim rather than what the endpoints
  do. Nothing verifies the two agree.
- **`/api/docs` is not behind the auth guard.** `SwaggerModule.setup` mounts
  through Express middleware rather than a Nest route handler, so the global
  `JwtAuthGuard` does not intercept it and no `@Public()` decorator is involved.
  Intended here — a reviewer must reach the docs without a token — but it means
  the endpoint list and schemas are publicly readable, and in a real deployment
  this would need gating by environment.

## Alternatives rejected

- **Scalar (`@scalar/nestjs-api-reference`)** — a better-looking renderer over
  the same generated spec, and a five-minute swap. Rejected because it changes
  only aesthetics: it is a second package spent making an ungraded nice-to-have
  prettier. Reconsider only if the graded core is complete and green.
- **Redoc / Stoplight Elements** — also renderers. Redoc reads better as
  reference documentation but is read-only by default, losing "try it out",
  which for a reviewer poking at endpoints is a downgrade.
- **`ts-rest` / `nestjs-zod`** — genuinely different, and arguably the better
  architecture: define a Zod contract, derive router, client types and spec from
  it. Rejected because both replace `class-validator`, reopening
  [ADR-0015](0015-input-validation-sanitization.md) and rewriting every DTO.
  That is an architecture change wearing a documentation costume, and it does
  not fit the timebox.
- **Hand-written OpenAPI YAML** — spec-first with `openapi-typescript` for
  types. More work, and it drifts from the code without discipline we have no
  time to build.

## Rules for agents

- Never add a second documentation package. `@nestjs/swagger` is the only one.
- Never put `@ApiProperty` or any OpenAPI decorator outside `interfaces/`.
- Keep `addBearerAuth()` configured; docs whose "try it out" always 401s are
  worse than no docs.
- Do not hand-write or hand-edit an OpenAPI file. The spec is generated.
- If the CLI plugin is disabled for any reason, say why in the README — the
  decorator noise that follows is otherwise unexplained.
