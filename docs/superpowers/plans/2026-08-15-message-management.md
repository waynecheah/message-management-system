# Message Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three message endpoints from `CONTEXT.md` — create, list, search — over MongoDB, Kafka and Elasticsearch, with tenant isolation, JWT verification, and a test suite covering the graded edge cases.

**Architecture:** Four DDD layers with inward-pointing dependencies enforced by ESLint. The domain owns identity (UUIDv7), the one write invariant, and six single-method ports. Infrastructure implements those ports over the MongoDB native driver, kafkajs and the Elasticsearch client. Writes go to MongoDB, publish a `message-created` event, and a consumer in the same process indexes into Elasticsearch, which is a derived read model.

**Tech Stack:** Node.js 24, `nub` 0.6, NestJS on Express, TypeScript 5.9 strict, MongoDB native driver, kafkajs, `@elastic/elasticsearch`, `class-validator`, `sanitize-html`, `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`, `@nestjs/swagger`, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-08-14-message-management-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **`nub` is the only package manager and runner.** `nub add`, `nub add -D`, `nub run <script>`, `nub exec <bin>`. **Never** `npm`, `npx`, `pnpm`, `yarn`, `bun` — not in a command, not in a `package.json` script, not in the README (ADR-0003).
- **Never run `nest new`, `nest g resource`, or `nest g service`.** The skeleton is hand-written (ADR-0003 amended 2026-08-14, ADR-0005).
- **TypeScript is pinned to `^5.9`**, not `^7`.
- **`tsconfig.json` must set `experimentalDecorators: true` and `emitDecoratorMetadata: true`.** Without both, `nub` cannot run NestJS at all.
- **All relative imports carry the `.ts` extension** (`import { Message } from './message.ts'`). The repo sets `allowImportingTsExtensions`, `nub` requires it under ESM, and Jest resolves it as a real path.
- **`domain/` imports from nothing** — not `application/`, not `infrastructure/`, not `interfaces/`. `application/` may not import `infrastructure/`. Enforced by `import/no-restricted-paths`; never weaken or `eslint-disable` it (ADR-0005).
- **No `ObjectId`, ever.** `_id` is a UUIDv7 stored as BSON Binary subtype 4. The mapper is the only place `_id` ↔ `id` translation happens (ADR-0008).
- **Never `skip`.** Keyset pagination on `(timestamp, _id)` (ADR-0013).
- **JWT verification pins `algorithms: ['ES256']`.** Public key only; never commit a private key, including test keys (ADR-0018).
- **`tenantId` and `senderId` come only from the verified `tid` / `sub` claims.** Never a header, query parameter or body field.
- **No `any`, no `@ts-ignore`.** The single exception is `metadata: Record<string, any>`, which `CONTEXT.md` defines verbatim.
- **Dependencies are closed.** Only: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/swagger`, `passport`, `passport-jwt`, `mongodb`, `kafkajs`, `@elastic/elasticsearch`, `class-validator`, `class-transformer`, `sanitize-html`, `reflect-metadata`, `rxjs`. Dev: `typescript`, `jest`, `ts-jest`, `@types/*`, `supertest`, `eslint`, `@typescript-eslint/*`, `eslint-plugin-import`, `prettier`, `eslint-config-prettier`. **Do not add:** `mongoose`, `@nestjs/mongoose`, `@nestjs/microservices`, `uuid`, `joi`, `@nestjs/throttler`, any cache package, `@nestjs/terminus`.
- **Every task ends with `nub run test` and `nub run lint` green, then exactly one commit.** Never claim completion without running both and seeing the output.
- **TDD is not optional.** Write the failing test, run it, confirm it fails for the stated reason, then write the minimal code.

### Deviation from the spec, and why

The spec's slice 1 is "done when every auth rejection case is green". Those rejections need a **protected route to reject**, and NestJS matches the route before running guards — a request to a not-yet-existing `POST /api/messages` returns 404, not 401. So the auth work splits: **Task 6** builds and unit-tests the strategy, guard and interceptor and proves `/health` is reachable without a token; **Task 10** runs the full 401 matrix against the real create endpoint the moment it exists. No coverage is dropped, only resequenced.

---

## File Structure

```
tsconfig.json                       modify — decorator flags
tsconfig.spec.json                  create — CommonJS for ts-jest
package.json                        modify — scripts, pinned TypeScript
eslint.config.js                    create — layering zones
jest.config.js                      create — unit + integration projects
docker-compose.yml                  create — mongo, kafka, elasticsearch
.env.example                        create
scripts/keygen.ts                   create — ES256 keypair into .env
scripts/explain.ts                  create — prints the listing query plan

src/main.ts                         bootstrap: body limit, pipes, filter, swagger
src/app.module.ts                   wiring, APP_GUARD, APP_INTERCEPTOR

src/domain/uuid-v7.ts               uuidV7(nowMs)
src/domain/errors.ts                DomainError + four subclasses
src/domain/message.ts               write-side entity
src/domain/message-view.ts          read projection + toMessageView
src/domain/message-created.event.ts event payload + toEvent
src/domain/cursor.ts                encode/decode, direction check
src/domain/page.ts                  Page<T>
src/domain/ports/*.port.ts          six ports + their DI tokens

src/application/create-message.usecase.ts
src/application/list-conversation-messages.usecase.ts
src/application/search-conversation-messages.usecase.ts
src/application/index-message.usecase.ts

src/infrastructure/config/env.config.ts, config.module.ts
src/infrastructure/identity/als-identity-context.ts, identity.interceptor.ts
src/infrastructure/mongo/mongo.module.ts, message.mapper.ts,
                        mongo-message.repository.ts, create-indexes.ts
src/infrastructure/kafka/kafka.module.ts, kafka-event-publisher.ts,
                        message-created.consumer.ts
src/infrastructure/elasticsearch/elasticsearch.module.ts,
                        message-index.mapping.ts, es-message-index.ts
src/infrastructure/auth/jwt.strategy.ts, jwt-auth.guard.ts, public.decorator.ts,
                        auth.module.ts

src/interfaces/http/messages.controller.ts
src/interfaces/http/conversation-messages.controller.ts
src/interfaces/http/health.controller.ts
src/interfaces/http/dto/*.dto.ts
src/interfaces/http/sanitize-content.pipe.ts
src/interfaces/http/domain-exception.filter.ts

test/setup.ts                       global setup: keypair, run ids
test/token.ts                       signs test tokens
test/app.ts                         boots the Nest testing module
```

---

### Task 1: Toolchain, skeleton, and a running test harness

**Files:**
- Modify: `tsconfig.json`, `package.json`
- Create: `tsconfig.spec.json`, `jest.config.js`, `src/main.ts`, `src/app.module.ts`, `src/interfaces/http/health.controller.ts`, `test/app.ts`, `src/domain/uuid-v7.ts`
- Test: `src/domain/uuid-v7.spec.ts`, `test/health.int-spec.ts`
- Modify: `docs/adr/0005-ddd-layering.md` (amendment)
- Delete: `index.ts`

**Interfaces:**
- Produces: `uuidV7(nowMs?: number): string`; `bootstrapTestApp(): Promise<INestApplication>` from `test/app.ts`; `AppModule` from `src/app.module.ts`.

- [ ] **Step 1: Pin TypeScript and add the decorator flags**

`package.json` — change `"typescript": "^7"` to `"typescript": "^5.9"`, then add to `tsconfig.json` `compilerOptions`:

```jsonc
"experimentalDecorators": true,
"emitDecoratorMetadata": true,
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
nub add @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config \
        reflect-metadata rxjs
nub add -D jest ts-jest @types/jest supertest @types/supertest
```

- [ ] **Step 3: Add the test tsconfig**

ts-jest needs CommonJS output; the runtime stays ESM.

```jsonc
// tsconfig.spec.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "verbatimModuleSyntax": false,
    "types": ["node", "jest"]
  }
}
```

- [ ] **Step 4: Add the Jest config with two projects**

```js
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
      maxWorkers: 1,
      testTimeout: 30000,
    },
  ],
};
```

Add to `package.json` scripts:

```jsonc
"test": "nub exec jest",
"test:unit": "nub exec jest --selectProjects unit",
"test:int": "nub exec jest --selectProjects integration",
"start": "nub src/main.ts"
```

- [ ] **Step 5: Write the failing unit test for the id generator**

```ts
// src/domain/uuid-v7.spec.ts
import { uuidV7 } from './uuid-v7.ts';

describe('uuidV7', () => {
  it('sets the version nibble to 7 and the variant bits to 10xx', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('encodes the supplied millisecond in the leading 48 bits', () => {
    const ms = 1_760_000_000_000;
    const hex = uuidV7(ms).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(ms);
  });

  it('sorts lexicographically in generation order across milliseconds', () => {
    const earlier = uuidV7(1_000_000_000_000);
    const later = uuidV7(1_000_000_000_001);
    expect(earlier < later).toBe(true);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './uuid-v7.ts'`

- [ ] **Step 7: Write the generator**

```ts
// src/domain/uuid-v7.ts
import { randomFillSync } from 'node:crypto';

/**
 * RFC 9562 UUID version 7: 48-bit big-endian millisecond timestamp, then random.
 * node:crypto.randomUUID() emits v4 and silently ignores { version: 7 } (ADR-0008).
 */
export function uuidV7(nowMs: number = Date.now()): string {
  const bytes = Buffer.allocUnsafe(16);
  randomFillSync(bytes);
  bytes.writeUIntBE(nowMs, 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variant 10xx
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

- [ ] **Step 8: Run the unit test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 3 tests. This also proves ts-jest, the tsconfig pair and `.ts` imports all work before anything is built on them.

- [ ] **Step 9: Write the failing integration test for the health route**

```ts
// test/health.int-spec.ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './app.ts';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 10: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — `Cannot find module './app.ts'`

- [ ] **Step 11: Write the skeleton by hand**

```ts
// src/interfaces/http/health.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './interfaces/http/health.controller.ts';

@Module({ controllers: [HealthController] })
export class AppModule {}
```

```ts
// src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(3000);
}

void bootstrap();
```

```ts
// test/app.ts
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.ts';

export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
```

- [ ] **Step 12: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS. If it fails with a decorator or `design:paramtypes` error, Step 1 did not take effect — fix that before continuing.

- [ ] **Step 13: Delete the placeholder entrypoint and check the app boots**

```bash
rm index.ts
nub run start   # expect it to listen on 3000; curl http://localhost:3000/health; then stop it
```

- [ ] **Step 14: Amend ADR-0005**

Under "This structure is imposed, not provided", replace the sentence permitting `nest new` for the initial skeleton with:

```markdown
**Amended 2026-08-14 — `nest new` is not run either.** It selects its own package
manager and writes npm-flavoured scripts (ADR-0003), so the skeleton — `main.ts`,
`app.module.ts` and the four layer directories — is written by hand.
```

- [ ] **Step 15: Commit**

```bash
git add tsconfig.json tsconfig.spec.json package.json nub.lock jest.config.js \
        src/ test/ docs/adr/0005-ddd-layering.md
git rm --cached index.ts 2>/dev/null; git add -A
git commit -m "feat: hand-written Nest skeleton, jest projects, uuidv7 generator"
```

---

### Task 2: The layering lint boundary

**Files:**
- Create: `eslint.config.js`, `.prettierrc`
- Modify: `package.json` (lint script)

**Interfaces:**
- Consumes: the four layer directories from Task 1.
- Produces: `nub run lint`, which every later task runs before committing.

- [ ] **Step 1: Install the lint toolchain**

```bash
nub add -D eslint @eslint/js typescript-eslint eslint-plugin-import \
           prettier eslint-config-prettier
```

- [ ] **Step 2: Write the flat config with the boundary zones**

```js
// eslint.config.js
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'import/no-restricted-paths': ['error', {
        zones: [
          { target: './src/domain',      from: './src/application' },
          { target: './src/domain',      from: './src/infrastructure' },
          { target: './src/domain',      from: './src/interfaces' },
          { target: './src/application', from: './src/infrastructure' },
          { target: './src/application', from: './src/interfaces' },
        ],
      }],
    },
  },
  { ignores: ['node_modules/', 'coverage/'] },
);
```

`metadata: Record<string, any>` is the one sanctioned `any`. Where it appears, disable that single rule on that single line with a comment naming `CONTEXT.md` — never disable `import/no-restricted-paths`.

```jsonc
// package.json scripts
"lint": "nub exec eslint src test",
"format": "nub exec prettier --write src test"
```

```jsonc
// .prettierrc
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

- [ ] **Step 3: Prove the boundary actually fails the build**

```bash
mkdir -p src/infrastructure/mongo
printf "export const x = 1;\n" > src/infrastructure/mongo/probe.ts
printf "import { x } from '../infrastructure/mongo/probe.ts';\nexport const y = x;\n" > src/domain/probe.ts
nub run lint
```

Expected: FAIL with `Unexpected path "../infrastructure/mongo/probe.ts" imported in restricted zone`.

- [ ] **Step 4: Remove the probe files and confirm lint is green**

```bash
rm src/domain/probe.ts src/infrastructure/mongo/probe.ts
nub run lint
```

Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc package.json nub.lock
git commit -m "chore: enforce DDD layering with eslint import zones"
```

---

### Task 3: Validated configuration

**Files:**
- Create: `src/infrastructure/config/env.config.ts`, `src/infrastructure/config/config.module.ts`, `.env.example`
- Modify: `src/app.module.ts`, `.gitignore`
- Test: `src/infrastructure/config/env.config.spec.ts`

**Interfaces:**
- Produces: `EnvConfig` (class with typed fields), `validateEnv(raw: Record<string, unknown>): EnvConfig`, and `AppConfigModule`. Every later task reads configuration by injecting `EnvConfig`; **no file outside this directory may read `process.env`**.

- [ ] **Step 1: Install config and validation packages**

```bash
nub add @nestjs/config class-validator class-transformer
```

- [ ] **Step 2: Write the failing test**

```ts
// src/infrastructure/config/env.config.spec.ts
import { validateEnv } from './env.config.ts';

const valid = {
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: 'messages',
  KAFKA_BROKERS: 'localhost:9092',
  KAFKA_TOPIC: 'message-created',
  KAFKA_PARTITIONS: '3',
  KAFKA_GROUP_ID: 'search-indexer',
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  ELASTICSEARCH_INDEX: 'messages',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nMFkw\n-----END PUBLIC KEY-----',
  JWT_ISSUER: 'https://issuer.test',
  JWT_AUDIENCE: 'message-api',
};

describe('validateEnv', () => {
  it('returns a typed config for a complete environment', () => {
    const config = validateEnv(valid);
    expect(config.KAFKA_PARTITIONS).toBe(3);
    expect(config.PORT).toBe(3000);
  });

  it('throws when MONGO_URL is missing', () => {
    const { MONGO_URL: _omitted, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/MONGO_URL/);
  });

  it('throws when JWT_PUBLIC_KEY is not a PEM public key', () => {
    expect(() => validateEnv({ ...valid, JWT_PUBLIC_KEY: 'not-a-key' })).toThrow(/JWT_PUBLIC_KEY/);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './env.config.ts'`

- [ ] **Step 4: Write the config**

```ts
// src/infrastructure/config/env.config.ts
import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Max, Min, validateSync } from 'class-validator';

export class EnvConfig {
  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  PORT = 3000;

  @IsString() @IsNotEmpty() MONGO_URL!: string;
  @IsString() @IsNotEmpty() MONGO_DB!: string;

  @IsString() @IsNotEmpty() KAFKA_BROKERS!: string;
  @IsString() @IsNotEmpty() KAFKA_TOPIC!: string;
  @Type(() => Number) @IsInt() @Min(1) KAFKA_PARTITIONS = 3;
  @IsString() @IsNotEmpty() KAFKA_GROUP_ID!: string;

  @IsString() @IsNotEmpty() ELASTICSEARCH_NODE!: string;
  @IsString() @IsNotEmpty() ELASTICSEARCH_INDEX!: string;

  @Matches(/-----BEGIN PUBLIC KEY-----/, { message: 'JWT_PUBLIC_KEY must be a PEM public key' })
  JWT_PUBLIC_KEY!: string;
  @IsString() @IsNotEmpty() JWT_ISSUER!: string;
  @IsString() @IsNotEmpty() JWT_AUDIENCE!: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const config = plainToInstance(EnvConfig, raw, { enableImplicitConversion: false });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.map((e) => e.toString()).join('\n')}`);
  }
  return config;
}
```

```ts
// src/infrastructure/config/config.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvConfig, validateEnv } from './env.config.ts';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
  providers: [{ provide: EnvConfig, useFactory: () => validateEnv(process.env) }],
  exports: [EnvConfig],
})
export class AppConfigModule {}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 3 new tests.

- [ ] **Step 6: Import the module and document the variables**

Add `AppConfigModule` to `AppModule`'s `imports`. Create `.env.example` with every variable and an empty or placeholder value, and add `.env` to `.gitignore` if it is not already there.

```bash
# .env.example
PORT=3000
MONGO_URL=mongodb://localhost:27017
MONGO_DB=messages
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=message-created
KAFKA_PARTITIONS=3
KAFKA_GROUP_ID=search-indexer
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX=messages
JWT_PUBLIC_KEY=
JWT_ISSUER=https://issuer.local
JWT_AUDIENCE=message-api
```

Copy it to `.env` locally so the app boots; `JWT_PUBLIC_KEY` gets filled by Task 6.

- [ ] **Step 7: Run both suites and lint, then commit**

```bash
nub run test && nub run lint
git add src/infrastructure/config .env.example .gitignore package.json nub.lock src/app.module.ts
git commit -m "feat: validate environment at boot with class-validator"
```

---

### Task 4: The infrastructure stack

**Files:**
- Create: `docker-compose.yml`
- Test: `test/infra-smoke.int-spec.ts`

**Interfaces:**
- Produces: a running Mongo on 27017, Kafka on 9092, Elasticsearch on 9200 — every later integration test depends on these being up.

- [ ] **Step 1: Install the three clients**

```bash
nub add mongodb kafkajs @elastic/elasticsearch
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  mongo:
    image: mongo:7
    ports: ['27017:27017']
    healthcheck:
      test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"]
      interval: 5s
      retries: 20

  kafka:
    image: bitnami/kafka:3.7
    ports: ['9092:9092']
    environment:
      KAFKA_CFG_NODE_ID: '1'
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: 'false'
      ALLOW_PLAINTEXT_LISTENER: 'yes'

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.0
    ports: ['9200:9200']
    environment:
      discovery.type: single-node
      xpack.security.enabled: 'false'
      ES_JAVA_OPTS: -Xms512m -Xmx512m
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://localhost:9200/_cluster/health || exit 1']
      interval: 5s
      retries: 30
```

`AUTO_CREATE_TOPICS_ENABLE: 'false'` is deliberate — it makes the explicit topic creation in Task 14 load-bearing instead of decorative.

- [ ] **Step 3: Write the failing connectivity smoke test**

```ts
// test/infra-smoke.int-spec.ts
import { MongoClient } from 'mongodb';
import { Kafka } from 'kafkajs';
import { Client as EsClient } from '@elastic/elasticsearch';

describe('infrastructure smoke', () => {
  it('reaches MongoDB', async () => {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const ping = await client.db('admin').command({ ping: 1 });
    expect(ping.ok).toBe(1);
    await client.close();
  });

  it('reaches Kafka', async () => {
    const admin = new Kafka({ clientId: 'smoke', brokers: ['localhost:9092'] }).admin();
    await admin.connect();
    expect(Array.isArray(await admin.listTopics())).toBe(true);
    await admin.disconnect();
  });

  it('reaches Elasticsearch', async () => {
    const es = new EsClient({ node: 'http://localhost:9200' });
    const health = await es.cluster.health();
    expect(['green', 'yellow']).toContain(health.status);
    await es.close();
  });
});
```

- [ ] **Step 4: Run it with the stack down and confirm it fails**

Run: `nub run test:int`
Expected: FAIL with connection refused — this proves the test is really talking to infrastructure.

- [ ] **Step 5: Start the stack and confirm it passes**

```bash
docker compose up -d
# wait for health, then:
nub run test:int
```

Expected: PASS, 3 smoke tests plus the health test from Task 1.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml test/infra-smoke.int-spec.ts package.json nub.lock
git commit -m "chore: add docker-compose stack and connectivity smoke test"
```

---

### Task 5: The domain core

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/message.ts`, `src/domain/message-view.ts`, `src/domain/message-created.event.ts`
- Test: `src/domain/message.spec.ts`

**Interfaces:**
- Consumes: `uuidV7` (Task 1).
- Produces:
  - `abstract class DomainError extends Error { abstract readonly code: string }`
  - `BlankContentError`, `InvalidCursorError`, `CursorDirectionError`, `MissingIdentityError`
  - `Message` with `static create(props: CreateMessageProps): Message` and readonly fields `id, tenantId, conversationId, senderId, content, timestamp, metadata`
  - `type MessageView = { id, conversationId, senderId, content, timestamp, metadata? }` and `toMessageView(m: Message): MessageView`
  - `type MessageCreatedEvent` and `toEvent(m: Message): MessageCreatedEvent`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/message.spec.ts
import { Message } from './message.ts';
import { BlankContentError } from './errors.ts';

const props = {
  tenantId: 't1',
  conversationId: 'c1',
  senderId: 's1',
  content: 'hello',
  metadata: undefined,
};

describe('Message.create', () => {
  it('generates a v7 id and a server timestamp', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const message = Message.create(props);
    expect(message.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(message.timestamp.toISOString()).toBe('2026-08-15T10:00:00.000Z');
    jest.useRealTimers();
  });

  it('derives the id and the timestamp from one clock read', () => {
    jest.useFakeTimers().setSystemTime(1_760_000_000_000);
    const message = Message.create(props);
    const embeddedMs = parseInt(message.id.replace(/-/g, '').slice(0, 12), 16);
    expect(embeddedMs).toBe(message.timestamp.getTime());
    jest.useRealTimers();
  });

  it('rejects blank content', () => {
    expect(() => Message.create({ ...props, content: '   ' })).toThrow(BlankContentError);
  });

  it('rejects content that sanitization reduced to nothing', () => {
    expect(() => Message.create({ ...props, content: '' })).toThrow(BlankContentError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './message.ts'`

- [ ] **Step 3: Write the errors**

```ts
// src/domain/errors.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class BlankContentError extends DomainError {
  readonly code = 'BLANK_CONTENT';
  constructor() {
    super('content is blank');
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  constructor() {
    super('cursor is not parseable');
  }
}

export class CursorDirectionError extends DomainError {
  readonly code = 'CURSOR_DIRECTION_MISMATCH';
  constructor() {
    super('cursor was issued for the other sort direction');
  }
}

export class MissingIdentityError extends DomainError {
  readonly code = 'MISSING_IDENTITY';
  constructor() {
    super('no tenant identity in context');
  }
}
```

- [ ] **Step 4: Write the entity**

```ts
// src/domain/message.ts
import { BlankContentError } from './errors.ts';
import { uuidV7 } from './uuid-v7.ts';

export type CreateMessageProps = {
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md defines metadata as Record<string, any>
  metadata: Record<string, any> | undefined;
};

/** Write-side entity. Read paths return MessageView instead (ADR-0020). */
export class Message {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly conversationId: string,
    readonly senderId: string,
    readonly content: string,
    readonly timestamp: Date,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
    readonly metadata: Record<string, any> | undefined,
  ) {}

  static create(props: CreateMessageProps): Message {
    if (props.content.trim().length === 0) throw new BlankContentError();
    const now = Date.now(); // one read: the id's millisecond and timestamp must agree
    return new Message(
      uuidV7(now),
      props.tenantId,
      props.conversationId,
      props.senderId,
      props.content,
      new Date(now),
      props.metadata,
    );
  }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 4 new tests.

- [ ] **Step 6: Write the read projection and the event**

```ts
// src/domain/message-view.ts
import type { Message } from './message.ts';

export type MessageView = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  readonly metadata?: Record<string, any>;
};

export function toMessageView(m: Message): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}
```

`tenantId` is absent by design: it is never part of a response body.

```ts
// src/domain/message-created.event.ts
import type { Message } from './message.ts';

export type MessageCreatedEvent = {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly timestamp: string; // ISO-8601 — the payload crosses a JSON boundary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  readonly metadata?: Record<string, any>;
};

export function toEvent(m: Message): MessageCreatedEvent {
  return {
    id: m.id,
    tenantId: m.tenantId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}
```

- [ ] **Step 7: Run everything and commit**

```bash
nub run test && nub run lint
git add src/domain
git commit -m "feat: message entity, view projection, and created event"
```

---

### Task 6: Authentication and ambient identity

**Files:**
- Create: `src/domain/ports/identity-context.port.ts`, `src/infrastructure/auth/jwt.strategy.ts`, `src/infrastructure/auth/jwt-auth.guard.ts`, `src/infrastructure/auth/public.decorator.ts`, `src/infrastructure/auth/auth.module.ts`, `src/infrastructure/identity/als-identity-context.ts`, `src/infrastructure/identity/identity.interceptor.ts`, `scripts/keygen.ts`, `test/token.ts`
- Modify: `src/app.module.ts`, `src/interfaces/http/health.controller.ts`, `package.json`
- Test: `src/infrastructure/auth/jwt.strategy.spec.ts`, `src/infrastructure/identity/als-identity-context.spec.ts`, `test/health.int-spec.ts`

**Interfaces:**
- Consumes: `MissingIdentityError` (Task 5), `EnvConfig` (Task 3).
- Produces:
  - `type Identity = { tenantId: string; senderId: string }`
  - `interface IdentityContext { require(): Identity }` and token `IDENTITY_CONTEXT`
  - `AlsIdentityContext` with `run<T>(identity: Identity, fn: () => T): T` in addition to `require()`
  - `@Public()` decorator and `IS_PUBLIC_KEY`
  - `signTestToken(claims?: Partial<{ tid: string; sub: string; expiresIn: string }>): string` from `test/token.ts`

- [ ] **Step 1: Install the auth packages**

```bash
nub add @nestjs/jwt @nestjs/passport passport passport-jwt
nub add -D @types/passport-jwt
```

- [ ] **Step 2: Write the keygen script and generate a local keypair**

```ts
// scripts/keygen.ts
import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

appendFileSync('.env', `\nJWT_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"\n`);
process.stdout.write(
  'Public key appended to .env.\n' +
    'Private key (for minting test tokens only — DO NOT COMMIT):\n\n' +
    privateKey +
    '\n',
);
```

```jsonc
// package.json scripts
"auth:keygen": "nub scripts/keygen.ts"
```

Run `nub run auth:keygen` and confirm `.env` gains a `JWT_PUBLIC_KEY`. `.env` must already be gitignored (Task 3).

- [ ] **Step 3: Write the failing unit tests**

```ts
// src/infrastructure/auth/jwt.strategy.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { validateClaims } from './jwt.strategy.ts';

describe('validateClaims', () => {
  it('maps tid and sub to the identity', () => {
    expect(validateClaims({ tid: 't1', sub: 's1' })).toEqual({ tenantId: 't1', senderId: 's1' });
  });

  it('rejects a token with no tid', () => {
    expect(() => validateClaims({ sub: 's1' })).toThrow(UnauthorizedException);
  });

  it('rejects a token with no sub', () => {
    expect(() => validateClaims({ tid: 't1' })).toThrow(UnauthorizedException);
  });
});
```

```ts
// src/infrastructure/identity/als-identity-context.spec.ts
import { MissingIdentityError } from '../../domain/errors.ts';
import { AlsIdentityContext } from './als-identity-context.ts';

describe('AlsIdentityContext', () => {
  const context = new AlsIdentityContext();

  it('throws when no store has been entered', () => {
    expect(() => context.require()).toThrow(MissingIdentityError);
  });

  it('returns the identity inside the store', () => {
    const identity = { tenantId: 't1', senderId: 's1' };
    const seen = context.run(identity, () => context.require());
    expect(seen).toEqual(identity);
  });

  it('does not leak the identity outside the callback', () => {
    context.run({ tenantId: 't1', senderId: 's1' }, () => undefined);
    expect(() => context.require()).toThrow(MissingIdentityError);
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `nub run test:unit`
Expected: FAIL — both modules missing.

- [ ] **Step 5: Write the port, the ALS adapter and the strategy**

```ts
// src/domain/ports/identity-context.port.ts
export type Identity = { readonly tenantId: string; readonly senderId: string };

export interface IdentityContext {
  /** Throws MissingIdentityError when there is no ambient identity. */
  require(): Identity;
}

export const IDENTITY_CONTEXT = Symbol('IdentityContext');
```

```ts
// src/infrastructure/identity/als-identity-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { MissingIdentityError } from '../../domain/errors.ts';
import type { Identity, IdentityContext } from '../../domain/ports/identity-context.port.ts';

@Injectable()
export class AlsIdentityContext implements IdentityContext {
  private readonly storage = new AsyncLocalStorage<Identity>();

  run<T>(identity: Identity, fn: () => T): T {
    return this.storage.run(identity, fn);
  }

  require(): Identity {
    const identity = this.storage.getStore();
    if (!identity) throw new MissingIdentityError();
    return identity;
  }
}
```

```ts
// src/infrastructure/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Identity } from '../../domain/ports/identity-context.port.ts';
import { EnvConfig } from '../config/env.config.ts';

export function validateClaims(payload: { tid?: string; sub?: string }): Identity {
  if (!payload.tid || !payload.sub) throw new UnauthorizedException();
  return { tenantId: payload.tid, senderId: payload.sub };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: EnvConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.JWT_PUBLIC_KEY,
      algorithms: ['ES256'], // pinned — never read from the token's alg header
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      ignoreExpiration: false,
    });
  }

  validate(payload: { tid?: string; sub?: string }): Identity {
    return validateClaims(payload);
  }
}
```

- [ ] **Step 6: Run the unit tests and confirm they pass**

Run: `nub run test:unit`
Expected: PASS, 6 new tests.

- [ ] **Step 7: Write the guard, the `@Public()` decorator and the interceptor**

```ts
// src/infrastructure/auth/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```ts
// src/infrastructure/auth/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator.ts';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }
}
```

```ts
// src/infrastructure/identity/identity.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Identity } from '../../domain/ports/identity-context.port.ts';
import { AlsIdentityContext } from './als-identity-context.ts';

/**
 * An interceptor, not middleware and not the guard: middleware runs before the
 * token is verified, and a guard's canActivate returns rather than wrapping the
 * rest of the request (spec §1).
 */
@Injectable()
export class IdentityInterceptor implements NestInterceptor {
  constructor(private readonly context: AlsIdentityContext) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<{ user?: Identity }>();
    const identity = request.user;
    if (!identity) return next.handle(); // @Public() route: no store, require() will throw
    return new Observable((subscriber) =>
      this.context.run(identity, () => next.handle().subscribe(subscriber)),
    );
  }
}
```

- [ ] **Step 8: Wire the guard and interceptor globally**

```ts
// src/infrastructure/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AlsIdentityContext } from '../identity/als-identity-context.ts';
import { IdentityInterceptor } from '../identity/identity.interceptor.ts';
import { IDENTITY_CONTEXT } from '../../domain/ports/identity-context.port.ts';
import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { JwtStrategy } from './jwt.strategy.ts';

@Global()
@Module({
  imports: [PassportModule],
  providers: [
    JwtStrategy,
    AlsIdentityContext,
    { provide: IDENTITY_CONTEXT, useExisting: AlsIdentityContext },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdentityInterceptor },
  ],
  exports: [IDENTITY_CONTEXT, AlsIdentityContext],
})
export class AuthModule {}
```

Add `AuthModule` to `AppModule`'s imports, and mark the health route public:

```ts
// src/interfaces/http/health.controller.ts — add
import { Public } from '../../infrastructure/auth/public.decorator.ts';
// ...
@Public()
@Get()
check(): { status: string } { return { status: 'ok' }; }
```

- [ ] **Step 9: Add the test token helper and extend the health integration test**

```ts
// test/token.ts
import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken'; // transitive dependency of @nestjs/jwt

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_PUBLIC_KEY = publicKey;
export const TEST_ISSUER = 'https://issuer.test';
export const TEST_AUDIENCE = 'message-api';

export function signTestToken(
  claims: { tid?: string; sub?: string; expiresIn?: string } = {},
): string {
  const { tid = 'tenant-a', sub = 'sender-1', expiresIn = '5m' } = claims;
  const payload: Record<string, string> = {};
  if (tid) payload.tid = tid;
  if (sub) payload.sub = sub;
  return sign(payload, privateKey, {
    algorithm: 'ES256',
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    expiresIn,
  });
}
```

The keypair is generated in memory at import time — nothing is written to disk and nothing is committed (ADR-0018).

`test/app.ts` must now override `EnvConfig` so the app verifies against `TEST_PUBLIC_KEY`:

```ts
// test/app.ts — replace the module compilation
import { EnvConfig, validateEnv } from '../src/infrastructure/config/env.config.ts';
import { TEST_AUDIENCE, TEST_ISSUER, TEST_PUBLIC_KEY } from './token.ts';

const testEnv = validateEnv({
  MONGO_URL: 'mongodb://localhost:27017',
  MONGO_DB: `messages_test_${process.pid}`,
  KAFKA_BROKERS: 'localhost:9092',
  KAFKA_TOPIC: 'message-created',
  KAFKA_PARTITIONS: '3',
  KAFKA_GROUP_ID: `search-indexer-test-${Date.now()}`,
  ELASTICSEARCH_NODE: 'http://localhost:9200',
  ELASTICSEARCH_INDEX: `messages_test_${process.pid}`,
  JWT_PUBLIC_KEY: TEST_PUBLIC_KEY,
  JWT_ISSUER: TEST_ISSUER,
  JWT_AUDIENCE: TEST_AUDIENCE,
});

export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvConfig)
    .useValue(testEnv)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
```

The random group id and per-process database and index names are what keep parallel or repeated runs from colliding (spec §5).

```ts
// test/health.int-spec.ts — add
it('is reachable with no Authorization header', async () => {
  await request(app.getHttpServer()).get('/health').expect(200);
});
```

- [ ] **Step 10: Run everything, then commit**

```bash
nub run test && nub run lint
git add src/domain/ports src/infrastructure/auth src/infrastructure/identity \
        scripts/keygen.ts test/ package.json nub.lock src/app.module.ts \
        src/interfaces/http/health.controller.ts
git commit -m "feat: ES256 jwt verification with ambient tenant identity"
```

---

### Task 7: MongoDB mapper, indexes and the write repository

**Files:**
- Create: `src/domain/ports/message-writer.port.ts`, `src/infrastructure/mongo/message.mapper.ts`, `src/infrastructure/mongo/mongo.module.ts`, `src/infrastructure/mongo/create-indexes.ts`, `src/infrastructure/mongo/mongo-message.repository.ts`
- Modify: `src/app.module.ts`
- Test: `src/infrastructure/mongo/message.mapper.spec.ts`, `test/mongo-repository.int-spec.ts`

**Interfaces:**
- Consumes: `Message`, `MessageView` (Task 5), `IDENTITY_CONTEXT` (Task 6), `EnvConfig` (Task 3).
- Produces:
  - `interface MessageWriter { save(message: Message): Promise<void> }`, token `MESSAGE_WRITER`
  - `toBinaryId(id: string): UUID`, `toStringId(binary: Binary): string`, `toDocument(m: Message): MessageDocument`, `toView(doc: MessageDocument): MessageView`
  - `MONGO_COLLECTION` provider token returning `Collection<MessageDocument>`
  - `MESSAGES_INDEX_NAME = 'tenant_conversation_timestamp_id'`

- [ ] **Step 1: Write the failing mapper test**

```ts
// src/infrastructure/mongo/message.mapper.spec.ts
import { Binary, UUID } from 'mongodb';
import { Message } from '../../domain/message.ts';
import { toBinaryId, toDocument, toStringId, toView } from './message.mapper.ts';

const message = Message.create({
  tenantId: 't1',
  conversationId: 'c1',
  senderId: 's1',
  content: 'hello',
  metadata: { source: 'web' },
});

describe('message mapper', () => {
  it('stores _id as a 16-byte BSON Binary of subtype 4', () => {
    const doc = toDocument(message);
    expect(doc._id).toBeInstanceOf(Binary);
    expect(doc._id.sub_type).toBe(4);
    expect(doc._id.length()).toBe(16);
    expect('id' in doc).toBe(false);
  });

  it('round-trips the canonical id string', () => {
    expect(toStringId(toBinaryId(message.id))).toBe(message.id);
  });

  it('maps a document to a view with id and without tenantId', () => {
    const view = toView(toDocument(message));
    expect(view.id).toBe(message.id);
    expect(view.metadata).toEqual({ source: 'web' });
    expect('tenantId' in view).toBe(false);
  });

  it('never produces an ObjectId', () => {
    expect(toBinaryId(message.id)).toBeInstanceOf(UUID);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './message.mapper.ts'`

- [ ] **Step 3: Write the mapper**

```ts
// src/infrastructure/mongo/message.mapper.ts
import { Binary, UUID } from 'mongodb';
import type { Message } from '../../domain/message.ts';
import type { MessageView } from '../../domain/message-view.ts';

export type MessageDocument = {
  _id: Binary;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
};

/** The only place id <-> _id translation happens (ADR-0008). */
export const toBinaryId = (id: string): UUID => new UUID(id);
export const toStringId = (binary: Binary): string => binary.toUUID().toString();

export function toDocument(m: Message): MessageDocument {
  return {
    _id: toBinaryId(m.id),
    tenantId: m.tenantId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    timestamp: m.timestamp,
    ...(m.metadata === undefined ? {} : { metadata: m.metadata }),
  };
}

export function toView(doc: MessageDocument): MessageView {
  return {
    id: toStringId(doc._id),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: doc.content,
    timestamp: doc.timestamp,
    ...(doc.metadata === undefined ? {} : { metadata: doc.metadata }),
  };
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Write the failing repository integration test**

```ts
// test/mongo-repository.int-spec.ts
import { MongoClient, Binary } from 'mongodb';
import type { INestApplication } from '@nestjs/common';
import { Message } from '../src/domain/message.ts';
import { MESSAGE_WRITER } from '../src/domain/ports/message-writer.port.ts';
import type { MessageWriter } from '../src/domain/ports/message-writer.port.ts';
import { AlsIdentityContext } from '../src/infrastructure/identity/als-identity-context.ts';
import { MESSAGES_INDEX_NAME } from '../src/infrastructure/mongo/create-indexes.ts';
import { bootstrapTestApp, testEnv } from './app.ts';

describe('MongoMessageRepository', () => {
  let app: INestApplication;
  let writer: MessageWriter;
  let als: AlsIdentityContext;
  let client: MongoClient;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    writer = app.get<MessageWriter>(MESSAGE_WRITER);
    als = app.get(AlsIdentityContext);
    client = new MongoClient(testEnv.MONGO_URL);
    await client.connect();
  });

  afterAll(async () => {
    await client.db(testEnv.MONGO_DB).dropDatabase();
    await client.close();
    await app.close();
  });

  it('persists a message with a Binary _id and no id field', async () => {
    const message = Message.create({
      tenantId: 'tenant-a', conversationId: 'c1', senderId: 's1',
      content: 'stored', metadata: undefined,
    });
    await als.run({ tenantId: 'tenant-a', senderId: 's1' }, () => writer.save(message));

    const doc = await client.db(testEnv.MONGO_DB).collection('messages')
      .findOne({ conversationId: 'c1' });
    expect(doc?._id).toBeInstanceOf(Binary);
    expect(doc?.tenantId).toBe('tenant-a');
    expect(doc?.id).toBeUndefined();
  });

  it('declares the compound index at startup', async () => {
    const indexes = await client.db(testEnv.MONGO_DB).collection('messages').indexes();
    const compound = indexes.find((i) => i.name === MESSAGES_INDEX_NAME);
    expect(compound?.key).toEqual({ tenantId: 1, conversationId: 1, timestamp: -1, _id: -1 });
  });
});
```

Export `testEnv` from `test/app.ts` alongside `bootstrapTestApp`.

- [ ] **Step 6: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — `Cannot find module '../src/domain/ports/message-writer.port.ts'`

- [ ] **Step 7: Write the port, the module, the index declaration and the repository**

```ts
// src/domain/ports/message-writer.port.ts
import type { Message } from '../message.ts';

export interface MessageWriter {
  save(message: Message): Promise<void>;
}

export const MESSAGE_WRITER = Symbol('MessageWriter');
```

```ts
// src/infrastructure/mongo/create-indexes.ts
import type { Collection } from 'mongodb';
import type { MessageDocument } from './message.mapper.ts';

export const MESSAGES_INDEX_NAME = 'tenant_conversation_timestamp_id';

/** Declared explicitly: no ODM is doing it for us (ADR-0007). */
export async function createIndexes(collection: Collection<MessageDocument>): Promise<void> {
  await collection.createIndexes([
    {
      key: { tenantId: 1, conversationId: 1, timestamp: -1, _id: -1 },
      name: MESSAGES_INDEX_NAME,
    },
  ]);
}
```

```ts
// src/infrastructure/mongo/mongo.module.ts
import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Collection, MongoClient } from 'mongodb';
import { EnvConfig } from '../config/env.config.ts';
import { MESSAGE_WRITER } from '../../domain/ports/message-writer.port.ts';
import { createIndexes } from './create-indexes.ts';
import type { MessageDocument } from './message.mapper.ts';
import { MongoMessageRepository } from './mongo-message.repository.ts';

export const MONGO_CLIENT = Symbol('MongoClient');
export const MESSAGES_COLLECTION = Symbol('MessagesCollection');

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const client = new MongoClient(config.MONGO_URL);
        await client.connect();
        return client;
      },
    },
    {
      provide: MESSAGES_COLLECTION,
      inject: [MONGO_CLIENT, EnvConfig],
      useFactory: async (client: MongoClient, config: EnvConfig) => {
        const collection = client.db(config.MONGO_DB).collection<MessageDocument>('messages');
        await createIndexes(collection);
        return collection;
      },
    },
    MongoMessageRepository,
    { provide: MESSAGE_WRITER, useExisting: MongoMessageRepository },
  ],
  exports: [MESSAGE_WRITER, MESSAGES_COLLECTION],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(private readonly client: MongoClient) {}
  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
```

Inject `MONGO_CLIENT` into the module constructor with `@Inject(MONGO_CLIENT)`.

```ts
// src/infrastructure/mongo/mongo-message.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { Message } from '../../domain/message.ts';
import type { MessageWriter } from '../../domain/ports/message-writer.port.ts';
import { MESSAGES_COLLECTION } from './mongo.module.ts';
import { toDocument, type MessageDocument } from './message.mapper.ts';

@Injectable()
export class MongoMessageRepository implements MessageWriter {
  constructor(
    @Inject(MESSAGES_COLLECTION) private readonly collection: Collection<MessageDocument>,
  ) {}

  async save(message: Message): Promise<void> {
    await this.collection.insertOne(toDocument(message));
  }
}
```

Add `MongoModule` to `AppModule`'s imports.

- [ ] **Step 8: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 2 new tests.

- [ ] **Step 9: Run everything and commit**

```bash
nub run test && nub run lint
git add src/domain/ports src/infrastructure/mongo test/mongo-repository.int-spec.ts \
        test/app.ts src/app.module.ts
git commit -m "feat: mongo mapper, compound index and write repository"
```

---

### Task 8: The create-message use case

**Files:**
- Create: `src/domain/ports/event-publisher.port.ts`, `src/application/create-message.usecase.ts`
- Test: `src/application/create-message.usecase.spec.ts`

**Interfaces:**
- Consumes: `MessageWriter`/`MESSAGE_WRITER` (Task 7), `IdentityContext`/`IDENTITY_CONTEXT` (Task 6), `Message`, `toMessageView`, `toEvent` (Task 5).
- Produces:
  - `interface EventPublisher { publish(event: MessageCreatedEvent): Promise<void> }`, token `EVENT_PUBLISHER`
  - `class CreateMessage` with `execute(input: CreateMessageInput): Promise<MessageView>`
  - `type CreateMessageInput = { conversationId: string; content: string; metadata?: Record<string, any> }` — note there is no `senderId`.

- [ ] **Step 1: Write the failing test**

```ts
// src/application/create-message.usecase.spec.ts
import { BlankContentError } from '../domain/errors.ts';
import type { Message } from '../domain/message.ts';
import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { CreateMessage } from './create-message.usecase.ts';

class FakeWriter {
  readonly saved: Message[] = [];
  async save(message: Message): Promise<void> { this.saved.push(message); }
}
class FakePublisher {
  readonly published: MessageCreatedEvent[] = [];
  async publish(event: MessageCreatedEvent): Promise<void> { this.published.push(event); }
}
const identity = { require: () => ({ tenantId: 'tenant-a', senderId: 'sender-1' }) };
const input = { conversationId: 'c1', content: 'hello', metadata: undefined };

describe('CreateMessage', () => {
  it('returns a view carrying the identity from the token, not the input', async () => {
    const useCase = new CreateMessage(new FakeWriter(), new FakePublisher(), identity);
    const view = await useCase.execute(input);
    expect(view.senderId).toBe('sender-1');
    expect(view.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('saves before it publishes', async () => {
    const order: string[] = [];
    const writer = { save: async () => { order.push('save'); } };
    const publisher = { publish: async () => { order.push('publish'); } };
    await new CreateMessage(writer, publisher, identity).execute(input);
    expect(order).toEqual(['save', 'publish']);
  });

  it('publishes the tenant on the event so the consumer needs no context', async () => {
    const publisher = new FakePublisher();
    await new CreateMessage(new FakeWriter(), publisher, identity).execute(input);
    expect(publisher.published[0]?.tenantId).toBe('tenant-a');
  });

  it('still returns the message when publishing fails', async () => {
    const writer = new FakeWriter();
    const publisher = { publish: async () => { throw new Error('broker down'); } };
    const view = await new CreateMessage(writer, publisher, identity).execute(input);
    expect(view.content).toBe('hello');
    expect(writer.saved).toHaveLength(1);
  });

  it('does not persist content that is blank', async () => {
    const writer = new FakeWriter();
    const useCase = new CreateMessage(writer, new FakePublisher(), identity);
    await expect(useCase.execute({ ...input, content: '  ' })).rejects.toThrow(BlankContentError);
    expect(writer.saved).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './create-message.usecase.ts'`

- [ ] **Step 3: Write the port and the use case**

```ts
// src/domain/ports/event-publisher.port.ts
import type { MessageCreatedEvent } from '../message-created.event.ts';

export interface EventPublisher {
  publish(event: MessageCreatedEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EventPublisher');
```

```ts
// src/application/create-message.usecase.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Message } from '../domain/message.ts';
import { toEvent } from '../domain/message-created.event.ts';
import { toMessageView, type MessageView } from '../domain/message-view.ts';
import { EVENT_PUBLISHER, type EventPublisher } from '../domain/ports/event-publisher.port.ts';
import { IDENTITY_CONTEXT, type IdentityContext } from '../domain/ports/identity-context.port.ts';
import { MESSAGE_WRITER, type MessageWriter } from '../domain/ports/message-writer.port.ts';

export type CreateMessageInput = {
  conversationId: string;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata: Record<string, any> | undefined;
};

@Injectable()
export class CreateMessage {
  private readonly logger = new Logger(CreateMessage.name);

  constructor(
    @Inject(MESSAGE_WRITER) private readonly writer: MessageWriter,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext,
  ) {}

  async execute(input: CreateMessageInput): Promise<MessageView> {
    const { tenantId, senderId } = this.identity.require();
    const message = Message.create({ ...input, tenantId, senderId });

    await this.writer.save(message);

    try {
      await this.publisher.publish(toEvent(message));
    } catch (error) {
      // Never swallowed, never fatal: the message is in the system of record,
      // so failing the request would invite a duplicate retry (ADR-0011).
      this.logger.error(`message ${message.id} persisted but not published`, error);
    }

    return toMessageView(message);
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 5 new tests.

- [ ] **Step 5: Commit**

```bash
nub run test && nub run lint
git add src/domain/ports/event-publisher.port.ts src/application
git commit -m "feat: create-message use case with non-fatal publish failure"
```

---

### Task 9: The create endpoint

**Files:**
- Create: `src/interfaces/http/dto/create-message.dto.ts`, `src/interfaces/http/dto/message-response.dto.ts`, `src/interfaces/http/sanitize-content.pipe.ts`, `src/interfaces/http/domain-exception.filter.ts`, `src/interfaces/http/messages.controller.ts`, `src/interfaces/http/http.module.ts`, `src/interfaces/http/dto/max-json-bytes.validator.ts`
- Modify: `src/main.ts`, `src/app.module.ts`, `test/app.ts`
- Test: `src/interfaces/http/sanitize-content.pipe.spec.ts`, `test/create-message.int-spec.ts`

**Interfaces:**
- Consumes: `CreateMessage` (Task 8), `signTestToken` (Task 6).
- Produces: `POST /api/messages` returning `201 { id, conversationId, senderId, content, timestamp, metadata? }`; `DomainExceptionFilter`; `SanitizeContentPipe`.

- [ ] **Step 1: Install the sanitizer and Swagger**

```bash
nub add sanitize-html @nestjs/swagger
nub add -D @types/sanitize-html
```

- [ ] **Step 2: Write the failing pipe unit test**

```ts
// src/interfaces/http/sanitize-content.pipe.spec.ts
import { SanitizeContentPipe } from './sanitize-content.pipe.ts';

const pipe = new SanitizeContentPipe();
const meta = { type: 'body' as const, metatype: Object, data: undefined };

describe('SanitizeContentPipe', () => {
  it('strips markup from content', () => {
    const out = pipe.transform({ content: 'hi <b>there</b>' }, meta);
    expect(out.content).toBe('hi there');
  });

  it('reduces a script-only message to the empty string', () => {
    expect(pipe.transform({ content: '<script>alert(1)</script>' }, meta).content).toBe('');
  });

  it('leaves a body without content untouched', () => {
    expect(pipe.transform({ q: 'term' }, meta)).toEqual({ q: 'term' });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the pipe, the validator, the DTOs and the filter**

```ts
// src/interfaces/http/sanitize-content.pipe.ts
import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * Runs AFTER ValidationPipe so bounds apply to the raw value the client sent,
 * and so content that sanitizes away to nothing reaches Message.create (spec §1).
 */
@Injectable()
export class SanitizeContentPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): Record<string, unknown> {
    const body = value as Record<string, unknown>;
    if (metadata.type !== 'body' || typeof body?.content !== 'string') return body;
    return {
      ...body,
      content: sanitizeHtml(body.content, { allowedTags: [], allowedAttributes: {} }),
    };
  }
}
```

```ts
// src/interfaces/http/dto/max-json-bytes.validator.ts
import { registerDecorator, type ValidationOptions } from 'class-validator';

export function MaxJsonBytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'maxJsonBytes',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must serialize to at most ${max} bytes`, ...options },
      validator: {
        validate: (value: unknown) =>
          value === undefined || Buffer.byteLength(JSON.stringify(value)) <= max,
      },
    });
  };
}
```

```ts
// src/interfaces/http/dto/create-message.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaxJsonBytes } from './max-json-bytes.validator.ts';

export class CreateMessageDto {
  @ApiProperty({ maxLength: 128, example: 'conv-42' })
  @IsString() @IsNotEmpty() @MaxLength(128)
  conversationId!: string;

  @ApiProperty({ maxLength: 4000, example: 'hello there' })
  @IsString() @IsNotEmpty() @MaxLength(4000)
  content!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional() @IsObject() @MaxJsonBytes(4096)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
}
```

There is deliberately **no `senderId` field**: `forbidNonWhitelisted` turns a supplied one into a 400 (ADR-0018).

```ts
// src/interfaces/http/dto/message-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
}
```

```ts
// src/interfaces/http/domain-exception.filter.ts
import { Catch, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  BlankContentError, CursorDirectionError, DomainError, InvalidCursorError,
} from '../../domain/errors.ts';

const BAD_REQUEST = [BlankContentError, InvalidCursorError, CursorDirectionError];

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isClientFault = BAD_REQUEST.some((type) => error instanceof type);

    if (isClientFault) {
      response.status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: 400, error: error.code, message: error.message });
      return;
    }

    // MissingIdentityError and anything unmapped: our bug, not the caller's.
    this.logger.error(`unmapped domain error: ${error.code}`, error.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}
```

- [ ] **Step 5: Run the pipe test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 3 new tests.

- [ ] **Step 6: Write the failing endpoint integration test**

```ts
// test/create-message.int-spec.ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './app.ts';
import { signTestToken } from './token.ts';

describe('POST /api/messages', () => {
  let app: INestApplication;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const post = () => request(app.getHttpServer()).post('/api/messages');

  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('creates a message and echoes the sender from the token', async () => {
    const res = await post().set(auth())
      .send({ conversationId: 'c1', content: 'hello' }).expect(201);
    expect(res.body).toMatchObject({ conversationId: 'c1', content: 'hello', senderId: 'sender-1' });
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(res.body.tenantId).toBeUndefined();
  });

  it.each([
    ['no token', undefined],
    ['a malformed token', 'Bearer not.a.token'],
    ['an expired token', `Bearer ${signTestToken({ expiresIn: '-1s' })}`],
    ['a token with no tid', `Bearer ${signTestToken({ tid: '' })}`],
    ['a token with no sub', `Bearer ${signTestToken({ sub: '' })}`],
  ])('rejects %s with 401', async (_label, header) => {
    const req = post().send({ conversationId: 'c1', content: 'hello' });
    if (header) req.set({ Authorization: header });
    await req.expect(401);
  });

  it('rejects a body that supplies senderId', async () => {
    await post().set(auth())
      .send({ conversationId: 'c1', content: 'hello', senderId: 'someone-else' })
      .expect(400);
  });

  it.each([
    ['blank content', { conversationId: 'c1', content: '   ' }],
    ['missing content', { conversationId: 'c1' }],
    ['missing conversationId', { content: 'hello' }],
    ['oversized content', { conversationId: 'c1', content: 'x'.repeat(4001) }],
    ['oversized metadata', { conversationId: 'c1', content: 'hi', metadata: { k: 'x'.repeat(5000) } }],
  ])('rejects %s with 400', async (_label, body) => {
    await post().set(auth()).send(body).expect(400);
  });

  it('rejects content that sanitizes away to nothing', async () => {
    await post().set(auth())
      .send({ conversationId: 'c1', content: '<script>alert(1)</script>' })
      .expect(400);
  });

  it('stores markup content sanitized', async () => {
    const res = await post().set(auth())
      .send({ conversationId: 'c1', content: 'hi <b>there</b>' }).expect(201);
    expect(res.body.content).toBe('hi there');
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 8: Write the controller and wire the bootstrap**

```ts
// src/interfaces/http/messages.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { CreateMessage } from '../../application/create-message.usecase.ts';
import { CreateMessageDto } from './dto/create-message.dto.ts';
import { MessageResponseDto } from './dto/message-response.dto.ts';

@ApiTags('messages')
@Controller('api/messages')
export class MessagesController {
  constructor(private readonly createMessage: CreateMessage) {}

  @Post()
  @ApiCreatedResponse({ type: MessageResponseDto })
  async create(@Body() dto: CreateMessageDto): Promise<MessageResponseDto> {
    // tenantId and senderId come from the verified token via ALS (ADR-0018)
    return this.createMessage.execute({
      conversationId: dto.conversationId,
      content: dto.content,
      metadata: dto.metadata,
    });
  }
}
```

```ts
// src/interfaces/http/http.module.ts
import { Module } from '@nestjs/common';
import { CreateMessage } from '../../application/create-message.usecase.ts';
import { HealthController } from './health.controller.ts';
import { MessagesController } from './messages.controller.ts';

@Module({
  controllers: [HealthController, MessagesController],
  providers: [CreateMessage],
})
export class HttpModule {}
```

`AppModule` now imports `HttpModule` and no longer declares `HealthController` directly.

```ts
// src/main.ts — the full bootstrap
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module.ts';
import { EnvConfig } from './infrastructure/config/env.config.ts';
import { DomainExceptionFilter } from './interfaces/http/domain-exception.filter.ts';
import { SanitizeContentPipe } from './interfaces/http/sanitize-content.pipe.ts';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configure(app);
  app.enableShutdownHooks();
  await app.listen(app.get(EnvConfig).PORT);
}

export function configure(app: Parameters<typeof SwaggerModule.setup>[1]): void {
  app.use(express.json({ limit: '256kb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    new SanitizeContentPipe(), // after validation, deliberately
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  const docs = new DocumentBuilder().setTitle('Message Management').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));
}

void bootstrap();
```

Extract `configure(app)` so `test/app.ts` applies exactly the same pipes and filter — an integration suite running without them would be testing a different application. Call `configure(app)` in `bootstrapTestApp` before `app.init()`, and guard the `void bootstrap()` call so importing `main.ts` from tests does not start a listener (move `bootstrap` into a `if (process.argv[1]?.endsWith('main.ts'))` check, or keep `configure` in its own module — either is fine, pick one and be consistent).

- [ ] **Step 9: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 14 new cases. If the 401 matrix passes but the `senderId` case returns 201, `forbidNonWhitelisted` is not set.

- [ ] **Step 10: Run everything and commit**

```bash
nub run test && nub run lint
git add src/interfaces src/main.ts src/app.module.ts test/ package.json nub.lock
git commit -m "feat: POST /api/messages with validation, sanitization and error mapping"
```

---

### Task 10: The cursor

**Files:**
- Create: `src/domain/cursor.ts`, `src/domain/page.ts`
- Test: `src/domain/cursor.spec.ts`

**Interfaces:**
- Consumes: `InvalidCursorError`, `CursorDirectionError` (Task 5).
- Produces:
  - `type SortDirection = 'asc' | 'desc'`
  - `type Cursor = { timestamp: Date; id: string; direction: SortDirection }`
  - `encodeCursor(cursor: Cursor): string`
  - `decodeCursor(raw: string, expected: SortDirection): Cursor`
  - `type Page<T> = { items: T[]; nextCursor: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/cursor.spec.ts
import { CursorDirectionError, InvalidCursorError } from './errors.ts';
import { decodeCursor, encodeCursor } from './cursor.ts';

const cursor = {
  timestamp: new Date('2026-08-15T10:00:00.000Z'),
  id: '01996a1e-0000-7000-8000-000000000000',
  direction: 'desc' as const,
};

describe('cursor', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(cursor), 'desc')).toEqual(cursor);
  });

  it('is opaque base64url', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64', '!!!!'],
    ['too few parts', Buffer.from('123:abc').toString('base64url')],
    ['a non-numeric timestamp', Buffer.from('abc:x:desc').toString('base64url')],
    ['a malformed id', Buffer.from('123:not-a-uuid:desc').toString('base64url')],
    ['an unknown direction', Buffer.from('123:01996a1e-0000-7000-8000-000000000000:sideways').toString('base64url')],
  ])('rejects %s', (_label, raw) => {
    expect(() => decodeCursor(raw, 'desc')).toThrow(InvalidCursorError);
  });

  it('rejects a desc cursor presented with sort=asc', () => {
    expect(() => decodeCursor(encodeCursor(cursor), 'asc')).toThrow(CursorDirectionError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — `Cannot find module './cursor.ts'`

- [ ] **Step 3: Write the cursor and the page type**

```ts
// src/domain/page.ts
export type Page<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};
```

```ts
// src/domain/cursor.ts
import { CursorDirectionError, InvalidCursorError } from './errors.ts';

export type SortDirection = 'asc' | 'desc';

export type Cursor = {
  readonly timestamp: Date;
  readonly id: string;
  readonly direction: SortDirection;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    `${cursor.timestamp.getTime()}:${cursor.id}:${cursor.direction}`,
  ).toString('base64url');
}

export function decodeCursor(raw: string, expected: SortDirection): Cursor {
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(':');
  if (parts.length !== 3) throw new InvalidCursorError();
  const [ms, id, direction] = parts as [string, string, string];

  if (!/^\d+$/.test(ms)) throw new InvalidCursorError();
  if (!UUID_PATTERN.test(id)) throw new InvalidCursorError();
  if (direction !== 'asc' && direction !== 'desc') throw new InvalidCursorError();
  if (direction !== expected) throw new CursorDirectionError();

  return { timestamp: new Date(Number(ms)), id, direction };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 8 new cases.

- [ ] **Step 5: Commit**

```bash
nub run test && nub run lint
git add src/domain/cursor.ts src/domain/cursor.spec.ts src/domain/page.ts
git commit -m "feat: opaque keyset cursor with direction checking"
```

---

### Task 11: The keyset reader

**Files:**
- Create: `src/domain/ports/message-reader.port.ts`
- Modify: `src/infrastructure/mongo/mongo-message.repository.ts`, `src/infrastructure/mongo/mongo.module.ts`
- Test: `test/mongo-reader.int-spec.ts`

**Interfaces:**
- Consumes: `Cursor`, `SortDirection`, `Page` (Task 10), the mapper and collection (Task 7).
- Produces:
  - `type ListQuery = { conversationId: string; limit: number; direction: SortDirection; cursor: Cursor | null }`
  - `interface MessageReader { listByConversation(query: ListQuery): Promise<Page<MessageView>> }`, token `MESSAGE_READER`

- [ ] **Step 1: Write the failing integration test**

```ts
// test/mongo-reader.int-spec.ts
import type { INestApplication } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { Message } from '../src/domain/message.ts';
import { decodeCursor } from '../src/domain/cursor.ts';
import { MESSAGE_READER, type MessageReader } from '../src/domain/ports/message-reader.port.ts';
import { MESSAGE_WRITER, type MessageWriter } from '../src/domain/ports/message-writer.port.ts';
import { AlsIdentityContext } from '../src/infrastructure/identity/als-identity-context.ts';
import { MESSAGES_COLLECTION } from '../src/infrastructure/mongo/mongo.module.ts';
import { bootstrapTestApp, testEnv } from './app.ts';

const tenantA = { tenantId: 'tenant-a', senderId: 's1' };

describe('MongoMessageRepository reads', () => {
  let app: INestApplication;
  let reader: MessageReader;
  let writer: MessageWriter;
  let als: AlsIdentityContext;

  const seed = async (count: number, conversationId: string, tenantId = 'tenant-a') => {
    for (let i = 0; i < count; i += 1) {
      const message = Message.create({
        tenantId, conversationId, senderId: 's1',
        content: `message ${i}`, metadata: undefined,
      });
      await als.run({ tenantId, senderId: 's1' }, () => writer.save(message));
      await new Promise((r) => setTimeout(r, 2)); // distinct milliseconds
    }
  };

  beforeAll(async () => {
    app = await bootstrapTestApp();
    reader = app.get<MessageReader>(MESSAGE_READER);
    writer = app.get<MessageWriter>(MESSAGE_WRITER);
    als = app.get(AlsIdentityContext);
    await seed(5, 'paged');
    await seed(1, 'other-tenant', 'tenant-b');
  });

  afterAll(async () => {
    const client = await new MongoClient(testEnv.MONGO_URL).connect();
    await client.db(testEnv.MONGO_DB).dropDatabase();
    await client.close();
    await app.close();
  });

  const list = (query: Parameters<MessageReader['listByConversation']>[0]) =>
    als.run(tenantA, () => reader.listByConversation(query));

  it('returns newest first and hands back a cursor', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    expect(page.items.map((m) => m.content)).toEqual(['message 4', 'message 3']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('does not return the lookahead row as an item', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    expect(page.items).toHaveLength(2);
  });

  it('pages across a boundary without repeating or dropping', async () => {
    const first = await list({ conversationId: 'paged', limit: 2, direction: 'desc', cursor: null });
    const second = await list({
      conversationId: 'paged', limit: 2, direction: 'desc',
      cursor: decodeCursor(first.nextCursor as string, 'desc'),
    });
    expect(second.items.map((m) => m.content)).toEqual(['message 2', 'message 1']);
  });

  it('returns a null cursor on the last page', async () => {
    const page = await list({ conversationId: 'paged', limit: 50, direction: 'desc', cursor: null });
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('reverses with sort=asc using the same index', async () => {
    const page = await list({ conversationId: 'paged', limit: 2, direction: 'asc', cursor: null });
    expect(page.items.map((m) => m.content)).toEqual(['message 0', 'message 1']);
  });

  it('returns nothing for another tenant\'s conversation', async () => {
    const page = await list({
      conversationId: 'other-tenant', limit: 10, direction: 'desc', cursor: null,
    });
    expect(page.items).toEqual([]);
  });

  it('throws rather than wildcarding when no tenant is in context', async () => {
    await expect(
      reader.listByConversation({
        conversationId: 'paged', limit: 10, direction: 'desc', cursor: null,
      }),
    ).rejects.toThrow(/identity/i);
  });

  it('serves the query from the compound index with no in-memory sort', async () => {
    const collection = app.get(MESSAGES_COLLECTION);
    const plan = await collection
      .find({ tenantId: 'tenant-a', conversationId: 'paged' })
      .sort({ timestamp: -1, _id: -1 })
      .explain('queryPlanner');
    const stages = JSON.stringify(plan);
    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('"stage":"SORT"');
  });

  it('keeps a stable total order for ids generated in the same millisecond', async () => {
    const sameMs = 'tiebreak';
    const fixed = new Date('2026-08-15T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(fixed);
    for (let i = 0; i < 5; i += 1) {
      const message = Message.create({
        tenantId: 'tenant-a', conversationId: sameMs, senderId: 's1',
        content: `same ${i}`, metadata: undefined,
      });
      await als.run(tenantA, () => writer.save(message));
    }
    jest.useRealTimers();

    const first = await list({ conversationId: sameMs, limit: 3, direction: 'desc', cursor: null });
    const second = await list({
      conversationId: sameMs, limit: 3, direction: 'desc',
      cursor: decodeCursor(first.nextCursor as string, 'desc'),
    });
    const ids = [...first.items, ...second.items].map((m) => m.id);
    expect(new Set(ids).size).toBe(5); // no repeats, no drops across the boundary
  });
});
```

The last case is the one that proves BSON `Binary` byte order matches UUIDv7 string order — the assumption the tiebreaker rests on (spec §3).

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — `Cannot find module '../src/domain/ports/message-reader.port.ts'`

- [ ] **Step 3: Write the read port**

```ts
// src/domain/ports/message-reader.port.ts
import type { Cursor, SortDirection } from '../cursor.ts';
import type { MessageView } from '../message-view.ts';
import type { Page } from '../page.ts';

export type ListQuery = {
  readonly conversationId: string;
  readonly limit: number;
  readonly direction: SortDirection;
  readonly cursor: Cursor | null;
};

export interface MessageReader {
  listByConversation(query: ListQuery): Promise<Page<MessageView>>;
}

export const MESSAGE_READER = Symbol('MessageReader');
```

- [ ] **Step 4: Implement the keyset read on the repository**

```ts
// src/infrastructure/mongo/mongo-message.repository.ts — add
import type { Filter } from 'mongodb';
import { encodeCursor } from '../../domain/cursor.ts';
import type { Page } from '../../domain/page.ts';
import type { MessageView } from '../../domain/message-view.ts';
import type { ListQuery, MessageReader } from '../../domain/ports/message-reader.port.ts';
import { IDENTITY_CONTEXT, type IdentityContext } from '../../domain/ports/identity-context.port.ts';
import { toStringId, toView, toBinaryId } from './message.mapper.ts';

// class MongoMessageRepository implements MessageWriter, MessageReader
// constructor also takes: @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext

async listByConversation(query: ListQuery): Promise<Page<MessageView>> {
  const { tenantId } = this.identity.require(); // throws when absent — never a wildcard
  const ascending = query.direction === 'asc';

  const filter: Filter<MessageDocument> = { tenantId, conversationId: query.conversationId };
  if (query.cursor) {
    const boundId = toBinaryId(query.cursor.id); // the mapper owns id -> _id
    const at = query.cursor.timestamp;
    filter.$or = ascending
      ? [{ timestamp: { $gt: at } }, { timestamp: at, _id: { $gt: boundId } }]
      : [{ timestamp: { $lt: at } }, { timestamp: at, _id: { $lt: boundId } }];
  }

  const direction = ascending ? 1 : -1;
  const docs = await this.collection
    .find(filter)
    .sort({ timestamp: direction, _id: direction })
    .limit(query.limit + 1)           // one lookahead row, never a count query
    .toArray();

  const hasMore = docs.length > query.limit;
  const page = hasMore ? docs.slice(0, query.limit) : docs;
  const last = page.at(-1);

  return {
    items: page.map(toView),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            timestamp: last.timestamp,
            id: toStringId(last._id),
            direction: query.direction,
          })
        : null,
  };
}
```

Bind the new port in `mongo.module.ts`:

```ts
{ provide: MESSAGE_READER, useExisting: MongoMessageRepository },
```
and add `MESSAGE_READER` to that module's `exports`.

- [ ] **Step 5: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 9 new cases. If the `explain` case fails on a `SORT` stage, the index key order in Task 7 does not match the sort.

- [ ] **Step 6: Run everything and commit**

```bash
nub run test && nub run lint
git add src/domain/ports/message-reader.port.ts src/infrastructure/mongo test/mongo-reader.int-spec.ts
git commit -m "feat: keyset pagination served from the compound index"
```

---

### Task 12: The list endpoint

**Files:**
- Create: `src/application/list-conversation-messages.usecase.ts`, `src/interfaces/http/dto/list-messages.query.dto.ts`, `src/interfaces/http/dto/page-response.dto.ts`, `src/interfaces/http/conversation-messages.controller.ts`
- Modify: `src/interfaces/http/http.module.ts`
- Test: `src/application/list-conversation-messages.usecase.spec.ts`, `test/list-messages.int-spec.ts`

**Interfaces:**
- Consumes: `MESSAGE_READER` (Task 11), `decodeCursor` (Task 10).
- Produces: `GET /api/conversations/:conversationId/messages` returning `200 { items: MessageResponseDto[], nextCursor: string | null }`; `class ListConversationMessages` with `execute(input: { conversationId: string; limit: number; sort: SortDirection; cursor?: string }): Promise<Page<MessageView>>`.

- [ ] **Step 1: Write the failing use-case unit test**

```ts
// src/application/list-conversation-messages.usecase.spec.ts
import { CursorDirectionError } from '../domain/errors.ts';
import { encodeCursor } from '../domain/cursor.ts';
import type { ListQuery, MessageReader } from '../domain/ports/message-reader.port.ts';
import { ListConversationMessages } from './list-conversation-messages.usecase.ts';

const emptyPage = { items: [], nextCursor: null };

describe('ListConversationMessages', () => {
  it('passes a decoded cursor to the reader', async () => {
    const seen: ListQuery[] = [];
    const reader: MessageReader = {
      listByConversation: async (q) => { seen.push(q); return emptyPage; },
    };
    const raw = encodeCursor({
      timestamp: new Date('2026-08-15T10:00:00.000Z'),
      id: '01996a1e-0000-7000-8000-000000000000',
      direction: 'desc',
    });
    await new ListConversationMessages(reader).execute({
      conversationId: 'c1', limit: 20, sort: 'desc', cursor: raw,
    });
    expect(seen[0]?.cursor?.id).toBe('01996a1e-0000-7000-8000-000000000000');
  });

  it('passes a null cursor for the first page', async () => {
    const seen: ListQuery[] = [];
    const reader: MessageReader = {
      listByConversation: async (q) => { seen.push(q); return emptyPage; },
    };
    await new ListConversationMessages(reader).execute({
      conversationId: 'c1', limit: 20, sort: 'desc', cursor: undefined,
    });
    expect(seen[0]?.cursor).toBeNull();
  });

  it('rejects a cursor issued for the other direction', async () => {
    const reader: MessageReader = { listByConversation: async () => emptyPage };
    const raw = encodeCursor({
      timestamp: new Date(), id: '01996a1e-0000-7000-8000-000000000000', direction: 'desc',
    });
    await expect(
      new ListConversationMessages(reader).execute({
        conversationId: 'c1', limit: 20, sort: 'asc', cursor: raw,
      }),
    ).rejects.toThrow(CursorDirectionError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the use case**

```ts
// src/application/list-conversation-messages.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, type SortDirection } from '../domain/cursor.ts';
import type { MessageView } from '../domain/message-view.ts';
import type { Page } from '../domain/page.ts';
import { MESSAGE_READER, type MessageReader } from '../domain/ports/message-reader.port.ts';

export type ListInput = {
  conversationId: string;
  limit: number;
  sort: SortDirection;
  cursor: string | undefined;
};

@Injectable()
export class ListConversationMessages {
  constructor(@Inject(MESSAGE_READER) private readonly reader: MessageReader) {}

  async execute(input: ListInput): Promise<Page<MessageView>> {
    return this.reader.listByConversation({
      conversationId: input.conversationId,
      limit: input.limit,
      direction: input.sort,
      cursor: input.cursor ? decodeCursor(input.cursor, input.sort) : null,
    });
  }
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 3 new tests.

- [ ] **Step 5: Write the failing endpoint integration test**

```ts
// test/list-messages.int-spec.ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './app.ts';
import { signTestToken } from './token.ts';

describe('GET /api/conversations/:conversationId/messages', () => {
  let app: INestApplication;
  const tokenA = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const tokenB = signTestToken({ tid: 'tenant-b', sub: 'sender-2' });
  const url = '/api/conversations/listing/messages';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).post('/api/messages')
        .set({ Authorization: `Bearer ${tokenA}` })
        .send({ conversationId: 'listing', content: `message ${i}` }).expect(201);
      await new Promise((r) => setTimeout(r, 2));
    }
  });
  afterAll(async () => { await app.close(); });

  const get = (query = '') =>
    request(app.getHttpServer()).get(`${url}${query}`).set({ Authorization: `Bearer ${tokenA}` });

  it('returns an envelope, newest first', async () => {
    const res = await get('?limit=2').expect(200);
    expect(res.body.items.map((m: { content: string }) => m.content))
      .toEqual(['message 2', 'message 1']);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  it('follows the cursor to the next page', async () => {
    const first = await get('?limit=2').expect(200);
    const second = await get(`?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
    expect(second.body.items.map((m: { content: string }) => m.content)).toEqual(['message 0']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('reverses with sort=asc', async () => {
    const res = await get('?sort=asc&limit=1').expect(200);
    expect(res.body.items[0].content).toBe('message 0');
  });

  it.each([['?limit=0'], ['?limit=101'], ['?limit=abc'], ['?sort=sideways'], ['?cursor=!!!']])(
    'rejects %s with 400', async (query) => { await get(query).expect(400); },
  );

  it('rejects a desc cursor presented with sort=asc', async () => {
    const first = await get('?limit=1').expect(200);
    await get(`?sort=asc&cursor=${encodeURIComponent(first.body.nextCursor)}`).expect(400);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
  });

  it('gives another tenant an empty page, not a 404', async () => {
    const res = await request(app.getHttpServer()).get(url)
      .set({ Authorization: `Bearer ${tokenB}` }).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — 404.

- [ ] **Step 7: Write the query DTO and the controller**

```ts
// src/interfaces/http/dto/list-messages.query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sort: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page' })
  @IsOptional() @IsString()
  cursor?: string;
}
```

An out-of-range `limit` fails validation and returns 400 — it is never clamped (spec §3).

```ts
// src/interfaces/http/dto/page-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { MessageResponseDto } from './message-response.dto.ts';

export class PageResponseDto {
  @ApiProperty({ type: [MessageResponseDto] }) items!: MessageResponseDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
```

```ts
// src/interfaces/http/conversation-messages.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ListConversationMessages } from '../../application/list-conversation-messages.usecase.ts';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto.ts';
import { PageResponseDto } from './dto/page-response.dto.ts';

@ApiTags('conversations')
@Controller('api/conversations/:conversationId/messages')
export class ConversationMessagesController {
  constructor(private readonly listMessages: ListConversationMessages) {}

  @Get()
  @ApiOkResponse({ type: PageResponseDto })
  async list(
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<PageResponseDto> {
    const page = await this.listMessages.execute({
      conversationId,
      limit: query.limit,
      sort: query.sort,
      cursor: query.cursor,
    });
    return { items: [...page.items], nextCursor: page.nextCursor };
  }
}
```

Register the controller and `ListConversationMessages` in `HttpModule`.

- [ ] **Step 8: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 11 new cases.

- [ ] **Step 9: Run everything and commit**

```bash
nub run test && nub run lint
git add src/application src/interfaces test/list-messages.int-spec.ts
git commit -m "feat: GET conversation messages with keyset pagination and sorting"
```

---

### Task 13: The Kafka publisher

**Files:**
- Create: `src/infrastructure/kafka/kafka.module.ts`, `src/infrastructure/kafka/kafka-event-publisher.ts`
- Modify: `src/app.module.ts`
- Test: `test/kafka-publisher.int-spec.ts`

**Interfaces:**
- Consumes: `EVENT_PUBLISHER` port (Task 8), `EnvConfig` (Task 3).
- Produces: `KafkaEventPublisher` bound to `EVENT_PUBLISHER`; `KAFKA_CLIENT` token; the topic created at startup with `KAFKA_PARTITIONS` partitions.

- [ ] **Step 1: Write the failing integration test**

```ts
// test/kafka-publisher.int-spec.ts
import type { INestApplication } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import request from 'supertest';

describe('Kafka publishing', () => {
  let app: INestApplication;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });

  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('creates the topic with the configured partition count', async () => {
    const admin = new Kafka({ clientId: 'assert', brokers: [testEnv.KAFKA_BROKERS] }).admin();
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata({ topics: [testEnv.KAFKA_TOPIC] });
    expect(metadata.topics[0]?.partitions).toHaveLength(testEnv.KAFKA_PARTITIONS);
    await admin.disconnect();
  });

  it('publishes a created message keyed by tenant and conversation', async () => {
    const kafka = new Kafka({ clientId: 'probe', brokers: [testEnv.KAFKA_BROKERS] });
    const consumer = kafka.consumer({ groupId: `probe-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({ topic: testEnv.KAFKA_TOPIC, fromBeginning: false });

    const received: { key: string; value: string }[] = [];
    await consumer.run({
      eachMessage: async ({ message }) => {
        received.push({ key: String(message.key), value: String(message.value) });
      },
    });

    await request(app.getHttpServer()).post('/api/messages')
      .set({ Authorization: `Bearer ${token}` })
      .send({ conversationId: 'published', content: 'over the wire' }).expect(201);

    await waitFor(() => received.length > 0);
    expect(received[0]?.key).toBe('tenant-a:published');
    const event = JSON.parse(received[0]!.value);
    expect(event).toMatchObject({ tenantId: 'tenant-a', conversationId: 'published',
      senderId: 'sender-1', content: 'over the wire' });
    expect(typeof event.timestamp).toBe('string');

    await consumer.disconnect();
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}
```

Move `waitFor` into `test/wait-for.ts` and import it here — Tasks 14 and 15 need the same helper.

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — the topic does not exist and no event arrives.

- [ ] **Step 3: Write the publisher and its module**

```ts
// src/infrastructure/kafka/kafka-event-publisher.ts
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import type { EventPublisher } from '../../domain/ports/event-publisher.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { KAFKA_CLIENT } from './kafka.module.ts';

@Injectable()
export class KafkaEventPublisher implements EventPublisher, OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(@Inject(KAFKA_CLIENT) kafka: Kafka, private readonly config: EnvConfig) {
    this.producer = kafka.producer({
      idempotent: true,                              // implies acks:-1, maxInFlight:1
      retry: { retries: 2, initialRetryTime: 100 },  // a broker outage must not stall writes
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(event: MessageCreatedEvent): Promise<void> {
    await this.producer.send({
      topic: this.config.KAFKA_TOPIC,
      timeout: 2000,
      messages: [
        {
          // per-conversation ordering: one conversation, one partition (ADR-0010)
          key: `${event.tenantId}:${event.conversationId}`,
          value: JSON.stringify(event),
        },
      ],
    });
  }
}
```

```ts
// src/infrastructure/kafka/kafka.module.ts
import { Global, Module } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { EVENT_PUBLISHER } from '../../domain/ports/event-publisher.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { KafkaEventPublisher } from './kafka-event-publisher.ts';

export const KAFKA_CLIENT = Symbol('KafkaClient');

@Global()
@Module({
  providers: [
    {
      provide: KAFKA_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const kafka = new Kafka({
          clientId: 'message-management',
          brokers: config.KAFKA_BROKERS.split(','),
        });
        // Auto-create is off in compose: one partition would erase the topology (ADR-0010)
        const admin = kafka.admin();
        await admin.connect();
        await admin.createTopics({
          topics: [{ topic: config.KAFKA_TOPIC, numPartitions: config.KAFKA_PARTITIONS }],
        });
        await admin.disconnect();
        return kafka;
      },
    },
    KafkaEventPublisher,
    { provide: EVENT_PUBLISHER, useExisting: KafkaEventPublisher },
  ],
  exports: [EVENT_PUBLISHER, KAFKA_CLIENT],
})
export class KafkaModule {}
```

Add `KafkaModule` to `AppModule`.

- [ ] **Step 4: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 2 new cases.

- [ ] **Step 5: Run everything and commit**

```bash
nub run test && nub run lint
git add src/infrastructure/kafka test/kafka-publisher.int-spec.ts test/wait-for.ts src/app.module.ts
git commit -m "feat: kafka producer with explicit topic topology and bounded send"
```

---

### Task 14: Elasticsearch indexing and the consumer

**Files:**
- Create: `src/domain/ports/message-indexer.port.ts`, `src/application/index-message.usecase.ts`, `src/infrastructure/elasticsearch/message-index.mapping.ts`, `src/infrastructure/elasticsearch/es-message-index.ts`, `src/infrastructure/elasticsearch/elasticsearch.module.ts`, `src/infrastructure/kafka/message-created.consumer.ts`
- Modify: `src/interfaces/http/health.controller.ts`, `src/infrastructure/kafka/kafka.module.ts`, `src/app.module.ts`
- Test: `src/application/index-message.usecase.spec.ts`, `test/indexing.int-spec.ts`

**Interfaces:**
- Consumes: `MessageCreatedEvent` (Task 5), `KAFKA_CLIENT` (Task 13), `EnvConfig` (Task 3).
- Produces:
  - `interface MessageIndexer { index(event: MessageCreatedEvent): Promise<void> }`, token `MESSAGE_INDEXER`
  - `class IndexMessage` with `execute(event: MessageCreatedEvent): Promise<void>`
  - `MESSAGE_INDEX_MAPPING`
  - `MessageCreatedConsumer` with `isRunning(): boolean`

- [ ] **Step 1: Write the failing use-case unit test**

```ts
// src/application/index-message.usecase.spec.ts
import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { IndexMessage } from './index-message.usecase.ts';

const event: MessageCreatedEvent = {
  id: '01996a1e-0000-7000-8000-000000000000',
  tenantId: 'tenant-a', conversationId: 'c1', senderId: 's1',
  content: 'indexed', timestamp: '2026-08-15T10:00:00.000Z',
};

describe('IndexMessage', () => {
  it('hands the event to the indexer unchanged', async () => {
    const seen: MessageCreatedEvent[] = [];
    await new IndexMessage({ index: async (e) => { seen.push(e); } }).execute(event);
    expect(seen).toEqual([event]);
  });

  it('propagates an indexing failure so the offset is not committed', async () => {
    const indexer = { index: async () => { throw new Error('es down'); } };
    await expect(new IndexMessage(indexer).execute(event)).rejects.toThrow('es down');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the port, the use case, the mapping and the adapter**

```ts
// src/domain/ports/message-indexer.port.ts
import type { MessageCreatedEvent } from '../message-created.event.ts';

export interface MessageIndexer {
  index(event: MessageCreatedEvent): Promise<void>;
}

export const MESSAGE_INDEXER = Symbol('MessageIndexer');
```

```ts
// src/application/index-message.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import type { MessageCreatedEvent } from '../domain/message-created.event.ts';
import { MESSAGE_INDEXER, type MessageIndexer } from '../domain/ports/message-indexer.port.ts';

@Injectable()
export class IndexMessage {
  constructor(@Inject(MESSAGE_INDEXER) private readonly indexer: MessageIndexer) {}

  /** Never catches: a swallowed failure would commit the offset past a lost document. */
  async execute(event: MessageCreatedEvent): Promise<void> {
    await this.indexer.index(event);
  }
}
```

```ts
// src/infrastructure/elasticsearch/message-index.mapping.ts
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

/**
 * No `id` property: the document id IS the message id (ADR-0011), so a copy in
 * _source would be a second value nothing keeps in sync.
 * `metadata.enabled: false` stores it without indexing it — client-controlled
 * keys would otherwise grow the cluster-state mapping without bound.
 */
export const MESSAGE_INDEX_MAPPING: MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    tenantId: { type: 'keyword' },
    conversationId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    timestamp: { type: 'date' },
    content: { type: 'text', analyzer: 'standard' },
    metadata: { type: 'object', enabled: false },
  },
};
```

```ts
// src/infrastructure/elasticsearch/es-message-index.ts
import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import type { MessageIndexer } from '../../domain/ports/message-indexer.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { ES_CLIENT } from './elasticsearch.module.ts';

@Injectable()
export class EsMessageIndex implements MessageIndexer {
  constructor(
    @Inject(ES_CLIENT) private readonly client: Client,
    private readonly config: EnvConfig,
  ) {}

  /** Tenant comes from the event: the consumer has no ambient context (ADR-0012). */
  async index(event: MessageCreatedEvent): Promise<void> {
    await this.client.index({
      index: this.config.ELASTICSEARCH_INDEX,
      id: event.id, // upsert by message id — replay is a no-op (ADR-0011)
      document: {
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        content: event.content,
        timestamp: event.timestamp,
        ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
      },
    });
  }
}
```

```ts
// src/infrastructure/elasticsearch/elasticsearch.module.ts
import { Global, Module } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { MESSAGE_INDEXER } from '../../domain/ports/message-indexer.port.ts';
import { EnvConfig } from '../config/env.config.ts';
import { EsMessageIndex } from './es-message-index.ts';
import { MESSAGE_INDEX_MAPPING } from './message-index.mapping.ts';

export const ES_CLIENT = Symbol('ElasticsearchClient');

@Global()
@Module({
  providers: [
    {
      provide: ES_CLIENT,
      inject: [EnvConfig],
      useFactory: async (config: EnvConfig) => {
        const client = new Client({ node: config.ELASTICSEARCH_NODE });
        const exists = await client.indices.exists({ index: config.ELASTICSEARCH_INDEX });
        if (!exists) {
          await client.indices.create({
            index: config.ELASTICSEARCH_INDEX,
            mappings: MESSAGE_INDEX_MAPPING, // explicit, never dynamic
          });
        }
        return client;
      },
    },
    EsMessageIndex,
    { provide: MESSAGE_INDEXER, useExisting: EsMessageIndex },
  ],
  exports: [MESSAGE_INDEXER, ES_CLIENT],
})
export class ElasticsearchModule {}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 2 new tests.

- [ ] **Step 5: Write the failing pipeline integration test**

```ts
// test/indexing.int-spec.ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import { waitFor } from './wait-for.ts';
import { MessageCreatedConsumer } from '../src/infrastructure/kafka/message-created.consumer.ts';

describe('message indexing pipeline', () => {
  let app: INestApplication;
  let es: Client;
  const token = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });
  });
  afterAll(async () => {
    await es.indices.delete({ index: testEnv.ELASTICSEARCH_INDEX }, { ignore: [404] });
    await es.close();
    await app.close();
  });

  const created = async (content: string) =>
    (await request(app.getHttpServer()).post('/api/messages')
      .set({ Authorization: `Bearer ${token}` })
      .send({ conversationId: 'indexed', content }).expect(201)).body;

  const findById = async (id: string) => {
    await waitFor(async () => (await es.exists({ index: testEnv.ELASTICSEARCH_INDEX, id })));
    return es.get({ index: testEnv.ELASTICSEARCH_INDEX, id });
  };

  it('indexes a created message under its own id', async () => {
    const message = await created('indexed by the consumer');
    const doc = await findById(message.id);
    expect(doc._source).toMatchObject({
      tenantId: 'tenant-a', conversationId: 'indexed', content: 'indexed by the consumer',
    });
    expect((doc._source as Record<string, unknown>).id).toBeUndefined();
  });

  it('applies the explicit mapping, not a dynamic one', async () => {
    const mapping = await es.indices.getMapping({ index: testEnv.ELASTICSEARCH_INDEX });
    const properties = Object.values(mapping)[0]?.mappings.properties;
    expect(properties?.content).toMatchObject({ type: 'text' });
    expect(properties?.tenantId).toMatchObject({ type: 'keyword' });
    expect(properties?.metadata).toMatchObject({ enabled: false });
  });

  it('leaves state identical when the same event is consumed twice', async () => {
    const message = await created('consumed twice');
    const first = await findById(message.id);
    const consumer = app.get(MessageCreatedConsumer);
    await consumer.handle({
      id: message.id, tenantId: 'tenant-a', conversationId: 'indexed',
      senderId: 'sender-1', content: 'consumed twice', timestamp: message.timestamp,
    });
    await es.indices.refresh({ index: testEnv.ELASTICSEARCH_INDEX });
    const second = await es.get({ index: testEnv.ELASTICSEARCH_INDEX, id: message.id });
    expect(second._source).toEqual(first._source);
    const count = await es.count({
      index: testEnv.ELASTICSEARCH_INDEX,
      query: { term: { _id: message.id } },
    });
    expect(count.count).toBe(1);
  });

  it('reports the indexer as running on /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', indexer: 'running' });
  });

  it('reports 503 once the indexer has stopped', async () => {
    app.get(MessageCreatedConsumer).markStopped('test-induced');
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', indexer: 'stopped' });
  });
});
```

Run the health cases last: `markStopped` is deliberately one-way.

- [ ] **Step 6: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — `MessageCreatedConsumer` does not exist.

- [ ] **Step 7: Write the consumer and the liveness-aware health route**

```ts
// src/infrastructure/kafka/message-created.consumer.ts
import {
  Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit,
} from '@nestjs/common';
import { Kafka, type Consumer } from 'kafkajs';
import { IndexMessage } from '../../application/index-message.usecase.ts';
import type { MessageCreatedEvent } from '../../domain/message-created.event.ts';
import { EnvConfig } from '../config/env.config.ts';
import { KAFKA_CLIENT } from './kafka.module.ts';

@Injectable()
export class MessageCreatedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageCreatedConsumer.name);
  private readonly consumer: Consumer;
  private state: 'running' | 'stopped' = 'stopped';

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly config: EnvConfig,
    private readonly indexMessage: IndexMessage,
  ) {
    this.consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID });
  }

  async onModuleInit(): Promise<void> {
    this.consumer.on('consumer.crash', (event) => {
      this.markStopped(String(event.payload.error));
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.KAFKA_TOPIC, fromBeginning: false });
    await this.consumer.run({
      // kafkajs commits only after this resolves; a throw means redelivery,
      // which the id-keyed upsert makes a no-op (ADR-0011).
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        await this.handle(JSON.parse(message.value.toString()) as MessageCreatedEvent);
      },
    });
    this.state = 'running';
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  async handle(event: MessageCreatedEvent): Promise<void> {
    await this.indexMessage.execute(event);
  }

  markStopped(reason: string): void {
    this.state = 'stopped';
    this.logger.error(`indexer halted: ${reason}`);
  }

  isRunning(): boolean {
    return this.state === 'running';
  }
}
```

Register `MessageCreatedConsumer` and `IndexMessage` as providers in `KafkaModule`, and export `MessageCreatedConsumer`.

```ts
// src/interfaces/http/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessageCreatedConsumer } from '../../infrastructure/kafka/message-created.consumer.ts';
import { Public } from '../../infrastructure/auth/public.decorator.ts';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly indexer: MessageCreatedConsumer) {}

  @Public()
  @Get()
  check(): { status: string; indexer: string } {
    if (!this.indexer.isRunning()) {
      // A halted indexer would otherwise leave the API returning 201s while
      // search silently stops updating — the failure mode we rejected a DLQ for.
      throw new ServiceUnavailableException({
        status: 'degraded', indexer: 'stopped', reason: 'consumer crashed',
      });
    }
    return { status: 'ok', indexer: 'running' };
  }
}
```

The earlier `GET /health` assertion in `test/health.int-spec.ts` expects `{ status: 'ok' }` exactly — update it to `{ status: 'ok', indexer: 'running' }`.

- [ ] **Step 8: Run the integration tests and confirm they pass**

Run: `nub run test:int`
Expected: PASS, 5 new cases plus the updated health case.

- [ ] **Step 9: Run everything and commit**

```bash
nub run test && nub run lint
git add src/domain/ports/message-indexer.port.ts src/application/index-message.usecase.ts \
        src/infrastructure/elasticsearch src/infrastructure/kafka src/interfaces/http \
        test/ src/app.module.ts
git commit -m "feat: index messages into elasticsearch via a kafka consumer"
```

---

### Task 15: The search endpoint

**Files:**
- Create: `src/domain/ports/message-searcher.port.ts`, `src/application/search-conversation-messages.usecase.ts`, `src/interfaces/http/dto/search-messages.query.dto.ts`
- Modify: `src/infrastructure/elasticsearch/es-message-index.ts`, `src/infrastructure/elasticsearch/elasticsearch.module.ts`, `src/interfaces/http/conversation-messages.controller.ts`, `src/interfaces/http/http.module.ts`
- Test: `src/application/search-conversation-messages.usecase.spec.ts`, `test/search-messages.int-spec.ts`

**Interfaces:**
- Consumes: `MessageView` (Task 5), `IDENTITY_CONTEXT` (Task 6), `ES_CLIENT` (Task 14).
- Produces:
  - `type SearchQuery = { conversationId: string; term: string; limit: number }`
  - `interface MessageSearcher { search(query: SearchQuery): Promise<MessageView[]> }`, token `MESSAGE_SEARCHER`
  - `class SearchConversationMessages` with `execute(query: SearchQuery): Promise<MessageView[]>`
  - `GET /api/conversations/:conversationId/messages/search?q=&limit=` returning `200 { items: [...] }`

- [ ] **Step 1: Write the failing use-case unit test**

```ts
// src/application/search-conversation-messages.usecase.spec.ts
import type { SearchQuery, MessageSearcher } from '../domain/ports/message-searcher.port.ts';
import { SearchConversationMessages } from './search-conversation-messages.usecase.ts';

describe('SearchConversationMessages', () => {
  it('passes the term and limit through to the searcher', async () => {
    const seen: SearchQuery[] = [];
    const searcher: MessageSearcher = { search: async (q) => { seen.push(q); return []; } };
    await new SearchConversationMessages(searcher)
      .execute({ conversationId: 'c1', term: 'hello', limit: 20 });
    expect(seen[0]).toEqual({ conversationId: 'c1', term: 'hello', limit: 20 });
  });

  it('returns an empty array when nothing matches', async () => {
    const searcher: MessageSearcher = { search: async () => [] };
    const results = await new SearchConversationMessages(searcher)
      .execute({ conversationId: 'c1', term: 'nothing', limit: 20 });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `nub run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the port, the use case and the search adapter**

```ts
// src/domain/ports/message-searcher.port.ts
import type { MessageView } from '../message-view.ts';

export type SearchQuery = {
  readonly conversationId: string;
  readonly term: string;
  readonly limit: number;
};

export interface MessageSearcher {
  search(query: SearchQuery): Promise<MessageView[]>;
}

export const MESSAGE_SEARCHER = Symbol('MessageSearcher');
```

```ts
// src/application/search-conversation-messages.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import type { MessageView } from '../domain/message-view.ts';
import {
  MESSAGE_SEARCHER, type MessageSearcher, type SearchQuery,
} from '../domain/ports/message-searcher.port.ts';

@Injectable()
export class SearchConversationMessages {
  constructor(@Inject(MESSAGE_SEARCHER) private readonly searcher: MessageSearcher) {}

  async execute(query: SearchQuery): Promise<MessageView[]> {
    return this.searcher.search(query);
  }
}
```

```ts
// src/infrastructure/elasticsearch/es-message-index.ts — add to the class
// constructor also takes: @Inject(IDENTITY_CONTEXT) private readonly identity: IdentityContext

type EsMessageSource = {
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CONTEXT.md
  metadata?: Record<string, any>;
};

async search(query: SearchQuery): Promise<MessageView[]> {
  // A request path, unlike index(): the tenant comes from the verified token.
  const { tenantId } = this.identity.require();

  const response = await this.client.search<EsMessageSource>({
    index: this.config.ELASTICSEARCH_INDEX,
    size: query.limit,
    query: {
      bool: {
        must: [{ match: { content: query.term } }],        // DSL, never query_string
        filter: [                                          // filter context: unscored, cacheable
          { term: { tenantId } },
          { term: { conversationId: query.conversationId } },
        ],
      },
    },
  });

  return response.hits.hits.flatMap((hit) =>
    hit._source ? [toView(hit._id, hit._source)] : [],
  );
}
```

```ts
// same file — the id comes from the document id, never from _source (spec §3)
function toView(id: string, source: EsMessageSource): MessageView {
  return {
    id,
    conversationId: source.conversationId,
    senderId: source.senderId,
    content: source.content,
    timestamp: new Date(source.timestamp),
    ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
  };
}
```

Bind `{ provide: MESSAGE_SEARCHER, useExisting: EsMessageIndex }` in `ElasticsearchModule` and export it.

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `nub run test:unit`
Expected: PASS, 2 new tests.

- [ ] **Step 5: Write the failing endpoint integration test**

```ts
// test/search-messages.int-spec.ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { bootstrapTestApp, testEnv } from './app.ts';
import { signTestToken } from './token.ts';
import { waitFor } from './wait-for.ts';

describe('GET /api/conversations/:conversationId/messages/search', () => {
  let app: INestApplication;
  let es: Client;
  const tokenA = signTestToken({ tid: 'tenant-a', sub: 'sender-1' });
  const tokenB = signTestToken({ tid: 'tenant-b', sub: 'sender-2' });
  const url = '/api/conversations/searchable/messages/search';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    es = new Client({ node: testEnv.ELASTICSEARCH_NODE });

    const post = (token: string, content: string) =>
      request(app.getHttpServer()).post('/api/messages')
        .set({ Authorization: `Bearer ${token}` })
        .send({ conversationId: 'searchable', content }).expect(201);

    await post(tokenA, 'the quick brown fox');
    await post(tokenA, 'a slow green turtle');
    await post(tokenB, 'the quick brown fox belonging to tenant b');

    // Wait for the consumer to index, then make the writes visible to search.
    await waitFor(async () => {
      await es.indices.refresh({ index: testEnv.ELASTICSEARCH_INDEX });
      const count = await es.count({ index: testEnv.ELASTICSEARCH_INDEX });
      return count.count >= 3;
    });
  });

  afterAll(async () => {
    await es.indices.delete({ index: testEnv.ELASTICSEARCH_INDEX }, { ignore: [404] });
    await es.close();
    await app.close();
  });

  const search = (query: string, token = tokenA) =>
    request(app.getHttpServer()).get(`${url}${query}`).set({ Authorization: `Bearer ${token}` });

  it('finds a message by a word in its content', async () => {
    const res = await search('?q=quick').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      content: 'the quick brown fox', conversationId: 'searchable', senderId: 'sender-1',
    });
    expect(res.body.items[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('returns an empty envelope when nothing matches', async () => {
    const res = await search('?q=aardvark').expect(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('never returns another tenant\'s messages', async () => {
    const res = await search('?q=quick', tokenB).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].content).toContain('tenant b');
  });

  it.each([['?q='], ['?q=' + 'x'.repeat(257)], ['?q=hi&limit=0'], ['?q=hi&limit=101']])(
    'rejects %s with 400', async (query) => { await search(query).expect(400); },
  );

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(`${url}?q=quick`).expect(401);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `nub run test:int`
Expected: FAIL — 404.

- [ ] **Step 7: Write the query DTO and add the route**

```ts
// src/interfaces/http/dto/search-messages.query.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchMessagesQueryDto {
  @ApiProperty({ maxLength: 256, example: 'quick' })
  @IsString() @IsNotEmpty() @MaxLength(256)
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
```

```ts
// src/interfaces/http/conversation-messages.controller.ts — add
import { SearchConversationMessages } from '../../application/search-conversation-messages.usecase.ts';
import { SearchMessagesQueryDto } from './dto/search-messages.query.dto.ts';
import { MessageResponseDto } from './dto/message-response.dto.ts';

// constructor also takes: private readonly searchMessages: SearchConversationMessages

@Get('search')
@ApiOkResponse({ schema: { properties: { items: { type: 'array' } } } })
async search(
  @Param('conversationId') conversationId: string,
  @Query() query: SearchMessagesQueryDto,
): Promise<{ items: MessageResponseDto[] }> {
  const items = await this.searchMessages.execute({
    conversationId, term: query.q, limit: query.limit,
  });
  return { items: [...items] };
}
```

Declare `@Get('search')` **before** the parameterless `@Get()` is irrelevant here — the two paths differ — but keep the search route in the same controller so both live under one resource path. Register `SearchConversationMessages` in `HttpModule`.

- [ ] **Step 8: Run the integration test and confirm it passes**

Run: `nub run test:int`
Expected: PASS, 8 new cases.

- [ ] **Step 9: Run everything and commit**

```bash
nub run test && nub run lint
git add src/domain/ports/message-searcher.port.ts src/application src/infrastructure/elasticsearch \
        src/interfaces/http test/search-messages.int-spec.ts
git commit -m "feat: full-text search over a conversation via elasticsearch"
```

---

### Task 16: README and the explain script

**Files:**
- Create: `scripts/explain.ts`
- Modify: `README.md`, `package.json`

**Interfaces:**
- Consumes: everything.
- Produces: `nub run db:explain`, and the graded README.

- [ ] **Step 1: Write the explain script**

```ts
// scripts/explain.ts
import { MongoClient } from 'mongodb';

const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB ?? 'messages';

const client = await new MongoClient(url).connect();
const plan = await client
  .db(dbName)
  .collection('messages')
  .find({ tenantId: 'tenant-a', conversationId: 'demo' })
  .sort({ timestamp: -1, _id: -1 })
  .limit(21)
  .explain('queryPlanner');

process.stdout.write(`${JSON.stringify(plan.queryPlanner ?? plan, null, 2)}\n`);
await client.close();
```

This is a script, not application code — reading `process.env` here does not violate the config rule, which governs `src/`.

```jsonc
// package.json scripts
"db:explain": "nub scripts/explain.ts"
```

- [ ] **Step 2: Run it and capture the output**

```bash
docker compose up -d
nub run db:explain
```

Expected: a plan whose winning stage is `IXSCAN` on `tenant_conversation_timestamp_id`. Keep the output for the README.

- [ ] **Step 3: Write the README**

Cover, in this order:

1. **What it is** — one paragraph, pointing at `CONTEXT.md`.
2. **Setup** — `docker compose up -d`, `nub install`, `nub run auth:keygen`, copy `.env.example` to `.env`, `nub run start`. **`nub` commands only** — no `npm` anywhere.
3. **Tests** — `nub run test`, `nub run test:unit` (no infrastructure needed), `nub run test:int` (needs the compose stack).
4. **API contract** — the three endpoints with request and response examples, and a pointer to `/api/docs`. State that `senderId` is never accepted in a body.
5. **Architecture decisions**, each with its reasoning and a link to the ADR:
   - DDD layering and the ESLint boundary that enforces it
   - the thin domain, and `MessageView` versus the entity
   - UUIDv7 as `_id` in BSON Binary subtype 4
   - keyset pagination — include the `explain()` output from Step 2
   - Kafka topic, partition and consumer-group design, and why the key is `tenantId:conversationId`
   - at-least-once delivery with idempotent indexing
   - the explicit Elasticsearch mapping, and why `metadata` is `enabled: false`
   - multi-tenancy: claims → ALS → repository filter, and why a cross-tenant read is an empty page rather than a 404
   - ES256 verification with the algorithm pinned, and why the service holds no private key
6. **Trade-offs and what is deliberately absent** — every one, with its reasoning:
   - the write-then-publish gap and the transactional outbox that would close it (ADR-0011)
   - no dead-letter queue; a halted indexer surfaces as a 503 on `/health` instead
   - API and indexer share a process, so they cannot scale independently
   - search returns the Elasticsearch `_source`, so a lagging index serves slightly stale content
   - no deep search pagination (`search_after`)
   - the three ranked deferrals from ADR-0017: refresh tokens, then rate limiting, then caching
   - the Swagger CLI plugin cannot run under `nub`, so `@ApiProperty` is hand-written (ADR-0019)
7. **Data-structure notes** — the lookahead row instead of a count query; why the compound index key order is what it is.

- [ ] **Step 4: Verify the README's own instructions**

Follow the setup section literally from a clean checkout in a scratch directory: clone, `nub install`, `docker compose up -d`, `nub run auth:keygen`, `nub run start`, `curl localhost:3000/health`. Fix anything that does not work as written.

- [ ] **Step 5: Run the full suite one final time and commit**

```bash
nub run test && nub run lint
git add README.md scripts/explain.ts package.json
git commit -m "docs: README with setup, API contract and architecture decisions"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: §0 toolchain → Task 1; §1 layer map → Tasks 1, 2, 5, 6; §2 create path → Tasks 5, 7, 8, 9; §3 read paths → Tasks 10, 11, 12, 15; §3 error mapping → Task 9; §3 cross-tenant empty page → Task 12; §4 pipeline → Tasks 13, 14; §5 testing → every task, with the Jest projects in Task 1 and the isolation mechanics in Task 6; §6 slices → the task ordering. The ADR-0005 amendment the spec asks for is Task 1 Step 14.

**Two known gaps, both deliberate:**

- **The 401 matrix moves from slice 1 to Task 9**, for the routing reason given at the top. Slice 1's auth work is still unit-tested where it lands.
- **`test/app.ts` grows across tasks** (Task 1 creates it, Task 6 adds the env override, Task 7 exports `testEnv`). Files that change together live together, and splitting a twenty-line test bootstrap across three modules would cost more than it saves.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries the code.

**Type consistency:** `MessageView` has no `tenantId` in Tasks 5, 7 and 15. `Cursor.direction` is `SortDirection` throughout. `MessageIndexer.index` takes `MessageCreatedEvent` (not `Message`) in Tasks 14 and 15. `MessageCreatedEvent.timestamp` is a string at every boundary, converted to `Date` only in `toView`. Every DI token is a `Symbol` declared next to its port.
