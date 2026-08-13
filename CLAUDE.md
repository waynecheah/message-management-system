# Project Rules — Message Management System

These rules are mandatory for every agent working in this repo.

Read `CONTEXT.md` first — it defines what we are building, the binding domain
vocabulary, and the API contract. Code, tests, and docs must use those terms with
those exact meanings.

## Decision records

`docs/adr/` holds the reasoning behind every rule below. **The ADRs are binding,
not background.** Where this file states a rule, the ADR states why — and each
carries `Rules for agents`, `Bad pattern` and `Good pattern` sections that are as
mandatory as anything here.

- **Before making an architectural decision, search `docs/adr/index.md` by
  keyword** and read the matching ADR. Most decisions you are about to make have
  already been made.
- **If this file and an ADR disagree, the ADR wins** — and fix this file.
- **Record new decisions as new ADRs.** Do not put rationale in this file, and do
  not silently reverse a decision an ADR already settled. Amend the ADR, note the
  amendment with a date, and update anything that referenced it.

| Section below | Decision records |
| --- | --- |
| Stack | 0002 runtime, 0004 HTTP platform |
| Toolchain | 0003 |
| MongoDB access | 0007 driver, 0008 UUIDv7 |
| TDD | 0014 |
| Scope | 0016 thin domain, 0017 deferred scope |
| Architecture | 0005 layering, 0009 system of record |
| SOLID | 0006 |
| Code quality | 0005, 0006, 0014 |
| Security | 0012 multi-tenancy, 0015 validation, 0018 auth |
| API documentation | 0019 |
| Performance | 0012 indexing, 0013 pagination, 0017 caching |

## Stack

- The stack in `CONTEXT.md` is fixed. Do not substitute the framework, data
  store, broker, or search engine.
- Add dependencies only when the mandated stack requires them: official Nest
  packages, `kafkajs`, `@elastic/elasticsearch`, `mongodb`, `class-validator` /
  `class-transformer`, `sanitize-html`, the JWT/passport packages, and
  `@nestjs/swagger` (ADR-0019). No convenience libraries beyond that.
- Dev dependencies additionally allowed: the TypeScript and Jest toolchain,
  `supertest` / `@types/supertest`, and the lint and format toolchain —
  `eslint`, `@typescript-eslint/*`, `eslint-plugin-import`, `prettier`,
  `eslint-config-prettier`. `eslint-plugin-import` is not optional; it carries
  the layering boundary (ADR-0005).
- Specifically **do not** add: `mongoose` / `@nestjs/mongoose` (ADR-0007),
  `@nestjs/microservices` (ADR-0010), the `uuid` package (ADR-0008), Fastify
  (ADR-0004), `joi` or any second validation library (ADR-0015), Scalar / Redoc
  or any second docs package (ADR-0019), or any caching or rate-limiting package
  (ADR-0017) — `@nestjs/throttler` included.
- Infrastructure runs via `docker-compose` so a reviewer can start Mongo, Kafka,
  and Elasticsearch with one command.

## Toolchain — `nub` only (hard rule)

`nub` is this project's Node.js toolkit. It is the only package manager and
runner. Never invoke `npm`, `pnpm`, `yarn`, `npx`, or `bun` — not in commands,
not in scripts, not in the README, not in CI.

| Task | Command |
| --- | --- |
| Scaffold | `nub init` |
| Install from lockfile | `nub install` (`nub ci` for clean/strict) |
| Add / remove a dependency | `nub add <pkg>` / `nub remove <pkg>` |
| Run a package.json script | `nub run <script>` |
| Run the test suite | `nub run test` |
| Run a local binary | `nub exec <bin>` (or `nub nubx <bin>`) |
| Fetch-and-run a package bin | `nub dlx <pkg>` |
| Run a file directly | `nub <file>` — TypeScript needs no build step |

- Commit `nub`'s lockfile. Do not commit `package-lock.json`, `pnpm-lock.yaml`,
  or `yarn.lock`; if one appears, delete it.
- `package.json` scripts are invoked through `nub run`, and must not shell out to
  another package manager internally.
- README setup instructions use `nub` commands only.

## MongoDB access — native driver + UUID (hard rule)

- Use the official `mongodb` native driver directly. **No Mongoose. No
  `@nestjs/mongoose`.** No ODM, no schema decorators — the persistence model is
  a plain mapper, which is what keeps the domain entity free of persistence
  concerns.
- **`_id` is a UUIDv7. Never `ObjectId`.** Do not import, generate, accept, or
  return an `ObjectId` anywhere in the codebase.
- Generate ids in the domain layer, not the database. The driver must never
  auto-assign an `_id`.
- **v7 specifically, not v4.** Its leading millisecond timestamp makes inserts
  append at the right edge of the `_id` index instead of scattering across it.
  `crypto.randomUUID()` emits v4 and silently ignores a `{ version: 7 }`
  option — never use it for `_id`. Use the project's v7 generator.
- Store `_id` as a BSON `UUID` (Binary subtype 4) rather than a hex string — it
  halves the index footprint and keeps equality lookups fast. Expose the
  canonical string form as `id` in the API, and convert in the mapper only.
  (BSON Binary *subtype 4* is unrelated to UUID *version 4*: we store a v7 UUID
  in a subtype 4 field.)
- The mapper is the single place `_id` ↔ `id` translation happens. No other
  layer may reference `_id`.
- Declare indexes explicitly at startup (`createIndexes`), not implicitly. The
  driver will not do it for you now that the ODM is gone.

## TDD (non-negotiable)

- If a written plan exists under [plans](docs/superpowers/plans/), follow it step by step, in order.
- Write the failing test FIRST. Run it and confirm it FAILS before writing any
  implementation.
- Write the minimal code to make the test pass. Nothing more.
- Run `nub run test` and confirm ALL tests pass before every commit. Never claim
  work is complete without running it and seeing the output.
- Run `nub run lint` and confirm it passes before every commit, too. It carries
  the DDD layering boundary (ADR-0005), so a red lint is an architecture
  violation, not a style nit. Never `eslint-disable` your way past it.

## Scope

- No features, abstractions, or "flexibility" beyond what `CONTEXT.md` requires.
- Touch only the files listed in your task. No drive-by edits, refactors, or
  comment cleanup.
- Favour one complete, coherent vertical slice over broad half-finished work.

## Architecture

- DDD layering: `domain` (entities, value objects, domain errors, ports) →
  `application` (use cases) → `infrastructure` (Mongo, Kafka, Elasticsearch
  adapters) → `interfaces` (controllers, DTOs). Dependencies point inward; the
  domain imports nothing from the other three.
- **This structure is ours, not NestJS's.** The framework ships a flat `src/`
  and its scaffolder generates feature modules. **Never run `nest g resource` or
  `nest g service`** — they produce a controller/service/entity folder that
  violates the layering. Create files by hand in the correct layer. `nest new`
  is fine for the initial skeleton, which is then restructured.
- Business logic lives in the domain and application layers only. Controllers
  stay thin, repositories stay dumb.
- The layering is enforced by an ESLint `import/no-restricted-paths` boundary,
  not by good intentions. Keep it passing; do not weaken, narrow, or disable the
  rule. `domain/` imports from none of the other three layers — not even
  `application/`.
- No decorators on entities or value objects. Only application services carry
  `@Injectable()`.
- MongoDB is the system of record. Elasticsearch is a derived read model — never
  read from it for anything but search.
- Keep the domain honestly thin: no value object without an invariant to
  protect, no aggregate without invariants, no domain event nothing consumes.
  Conversations are identified by id, not stored.

## SOLID (hard rule — no exceptions)

Every class you write must satisfy all five. This is graded, and it is not
negotiable for expedience or timebox pressure.

**S — Single Responsibility.** One class, one reason to change. A controller
parses and responds; a use case orchestrates; an entity holds invariants; a
repository persists; an adapter talks to one external system. A class that
validates AND persists AND publishes is three classes. If you cannot name a
class's job in one sentence without "and", split it.

**O — Open/Closed.** Extend by adding a type, not by editing a switch. Adding a
second search backend, a second event consumer, or a new message kind must not
require modifying existing tested classes. No `if (type === ...)` chains over
domain concepts — use polymorphism or a registry of strategies.

**L — Liskov Substitution.** Any implementation of a port must be usable wherever
the port is declared, with no caller-side type checks and no surprises. A fake
repository used in unit tests must honour the same contract as the Mongo one —
same errors thrown, same ordering guarantees, no stricter preconditions. If a
subclass throws "not supported", the abstraction is wrong.

**I — Interface Segregation.** Narrow, role-specific ports. A read path that only
lists messages depends on a list-messages port, not on a fat `MessageRepository`
exposing write, delete, and index methods. No implementation may be forced to
stub a method it does not need.

**D — Dependency Inversion.** The domain and application layers define the
interfaces; infrastructure implements them. Use cases receive ports through
constructor injection via Nest tokens — never `new SomeMongoClient()`, never an
import of a driver, client, or Nest infrastructure module inside `domain/` or
`application/`. Concrete adapters are bound to tokens in a module, in one place.

Practical checks before you commit:

- Could you swap Elasticsearch for another search backend by adding one adapter
  class and changing one module binding? If not, DIP or OCP is broken.
- Can every use case be unit tested with no Mongo, Kafka, or Elasticsearch
  running? If not, DIP is broken.
- Does any file in `domain/` or `application/` import from `infrastructure/`?
  That is a hard failure — fix it before proceeding.

## Code quality

- TypeScript strict mode. No `any`, no `@ts-ignore`. The one exception is
  `Message.metadata`, which the spec defines as `Record<string, any>`.
- Throw typed domain errors from the domain layer; map them to HTTP status codes
  in a Nest exception filter. Never throw a plain `Error` for a domain failure.
- Write both unit tests (domain and application, with ports mocked) and
  integration tests (endpoints end-to-end via Nest's testing module).
- Cover edge cases explicitly: missing or blank required fields, oversized
  content, invalid pagination values and malformed cursors, empty search
  results, cross-tenant access attempts, duplicate event consumption, and
  rejected requests (absent, malformed, or expired token; token missing `tid` or
  `sub`; `senderId` supplied in the body).
- Unit tests run with no Mongo, Kafka, or Elasticsearch running. If one needs
  infrastructure, the layering is broken — fix the layering, do not start the
  container.
- Integration tests run against the `docker-compose` stack. Search assertions
  must wait for the Elasticsearch refresh, not assert immediately after a POST.

## Security

- Validate and sanitize every input at the boundary with DTOs and
  `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`).
- Never interpolate user input into Mongo queries or Elasticsearch query
  strings — use parameterized/DSL forms only. Sanitize `content` against stored
  XSS.
- Every endpoint requires a valid JWT bearer token. The auth guard is global;
  exposing a route needs an explicit `@Public()` and an explicit instruction.
- **JWTs are ES256, and the API holds the public key only** — never a signing
  secret or private key. The service verifies; it must not be able to mint.
- **Pin the algorithm: `algorithms: ['ES256']`.** Never let the verifier read
  the algorithm from the token's `alg` header, and never list a symmetric
  algorithm alongside an asymmetric one. Omitting this is a full authentication
  bypass, not a hardening nicety.
- Never commit a private key, including dev and test keys. Generate with
  `nub run auth:keygen` into a gitignored `.env`; document the variables in
  `.env.example`.
- `tenantId` and `senderId` come from the verified token claims (`tid`, `sub`)
  only. Never from a header, query parameter, or request body — `senderId` is
  not a field on the create-message DTO.
- Enforce tenant scoping in the data-access layer. A missing tenant context is an
  error, never a wildcard.
- Never log, echo, or persist a raw token.
- Do not add a users collection, password hashing, a login endpoint, or a
  refresh-token store — authentication is verify-only. A stateful refresh flow
  is a deferred stretch goal (`docs/adr/0017`), not committed scope; it needs an
  explicit instruction. Do not add roles; authorization is tenant isolation and
  nothing else.
- No secrets in the repo. Configuration via environment variables with a
  committed `.env.example`.
- Validate environment variables at boot via `@nestjs/config`'s `validate` hook,
  using `class-validator` — not `joi`. A missing or malformed variable must stop
  the process starting, never surface on the first request that needs it.
- Never read `process.env` outside the config module. Consume the validated,
  typed config object; a direct read bypasses the boot-time check.

## Performance

- Index for the actual query patterns; verify with `explain()` where it matters.
  `tenantId` leads every compound index.
- **Use keyset/cursor pagination on `(timestamp, _id)` for message retrieval.
  Never `skip`** — its cost grows with offset and it drops or repeats rows when
  writes land mid-page.
- **Do not add caching or rate limiting.** Both are deferred (ADR-0017) and need
  an explicit instruction. If ever added: every cache key must be tenant-scoped,
  and the rate limiter must key on the tenant, never the client IP.
- Choose data structures deliberately; note any non-obvious choice in the README.

## Commits

- One commit per completed step, with a conventional, descriptive message.
- Do not batch unrelated changes into a single commit.
