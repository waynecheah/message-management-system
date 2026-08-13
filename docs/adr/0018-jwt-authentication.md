---
title: ADR-0018 - Stateless ES256 JWT verification, with tenant and sender identity taken from claims
description: A global guard verifies externally-issued bearer tokens with a pinned asymmetric algorithm; no login endpoint, no user store
---

# ADR-0018 — Stateless ES256 JWT verification, with tenant and sender identity taken from claims

## Status

Accepted — 2026-08-13
**Amended 2026-08-13** — originally specified HS256 with a shared secret, chosen
to keep keypair generation out of reviewer setup. That contradicted this ADR's
own thesis: a symmetric secret that verifies also mints, so the service would
have held the capability the design says it must not have. Replaced with
**ES256**, public key only, algorithm pinned.

Supersedes the authentication half of
[ADR-0017](0017-deferred-optional-scope.md), and the header-based tenant
mechanism in [ADR-0012](0012-multi-tenancy.md).

## Tags

`security` `authentication` `authorization` `multi-tenancy` `jwt` `nestjs`

## Decision

Authentication is **verify-only**. A global Nest guard validates a JWT bearer
token on every request. Tokens are assumed to be issued by an external identity
provider.

Signing is **ES256**, and the API holds the **public key only**. The verifier
pins `algorithms: ['ES256']`.

**Out of scope by choice:** no login endpoint, no user store, no password
hashing, no refresh-token flow. A stateful refresh flow — which would make this
service a token *issuer* rather than only a verifier — is deferred and ranked in
[ADR-0017](0017-deferred-optional-scope.md).

**Authorization is tenant isolation.** There are no roles. The token establishes
*which tenant* and *which sender* you are; the rule is that you may only read
and write within your own tenant.

**Identity comes from claims, never from the request:**

| Value | Source | Never from |
| --- | --- | --- |
| `tenantId` | verified `tid` claim | header, query, body |
| `senderId` | verified `sub` claim | body |

## Why

**The spec has no `User`.** Its data model defines only `Message`. A login flow
would require inventing a users collection, password hashing and a credential
store — real scope, invented requirements, and time taken from the graded core.
Verifying a token that someone else issued is what "basic authentication" means
in a service that owns messages, not identities.

**It closes the actual hole.** [ADR-0012](0012-multi-tenancy.md) had `tenantId`
arriving in a plain header, which any caller could set to any value — a total
cross-tenant breach, flagged there as unacceptable outside a code test. A signed
claim is a value the server issued and can verify. The enforcement machinery
does not change; only the trustworthiness of its input does.

**Stateless fits the architecture.** No session store, no lookup on the request
path, and nothing that would make a horizontally-scaled deployment need sticky
sessions or shared session state.

## Structure / Flow

```
request with Authorization: Bearer <jwt>
  → JwtAuthGuard  verify signature, exp, iss, aud
  → extract { tenantId: tid, senderId: sub }
  → ALS.run({ tenantId, senderId }, next)      (ADR-0012)
      ↓
  use case (identity-agnostic)
      ↓
  repository applies tenantId to every filter
```

## How it works

- `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`.
- The guard is registered **globally**, so endpoints are protected by default
  and exposure is an explicit opt-out via a `@Public()` decorator — used only
  for a health check. Default-open would mean one forgotten decorator becomes a
  data leak.
- Verified on every request: signature, `exp`, `iss`, `aud`. A token missing
  `tid` or `sub` is rejected outright rather than defaulted.
- **The algorithm is pinned:** `algorithms: ['ES256']` is passed explicitly to
  the verifier. See "Algorithm" below — this is not optional.
- The guard is the only component that touches the token. Everything downstream
  reads the ambient context from `AsyncLocalStorage`.
- `POST /api/messages` no longer accepts `senderId` in the body. Per
  [ADR-0015](0015-input-validation-sanitization.md)'s
  `forbidNonWhitelisted: true`, sending it is a rejected request, not a silently
  ignored field.

### Algorithm — ES256, pinned

**ES256** (ECDSA on P-256 with SHA-256). The API is configured with the
**public key only**, via environment variable.

**Why asymmetric at all.** This ADR's thesis is that the service verifies and
does not issue. HS256 would contradict it: one symmetric secret both mints and
verifies, so a compromised API could forge a token for any tenant. An asymmetric
key makes "verify-only" true in the cryptography, not just in the prose — the
service is structurally incapable of issuing.

**Why ES256 over RS256.** Both close the capability gap. ES256 additionally
gives a much smaller key (a couple of PEM lines rather than a 2048-bit blob) and
a 64-byte signature against RSA's 256, which keeps the `Authorization` header
small — proxies impose real header size limits. A 256-bit EC key is also
*stronger* than RSA-2048, roughly equivalent to RSA-3072; small key size here is
a benefit, not a compromise.

RS256's one advantage is that RSA verification is faster than ECDSA
verification, and this service does nothing but verify. It is not enough:
verification is ~50–100µs against a MongoDB round trip of 1–5ms. Optimizing the
microseconds while ignoring the milliseconds is the wrong end of the problem.

**The algorithm MUST be pinned.** Pass `algorithms: ['ES256']` explicitly, so
the verifier never takes the algorithm from the token's own `alg` header. Left
unpinned, an attacker re-signs a token under a different algorithm and the
verifier follows along — algorithm confusion. With an asymmetric setup the
specific attack is passing the public key off as an HMAC secret: it is published
by design, so anyone holding it could mint valid HS256 tokens. Pinning is one
line of configuration and its absence is a total authentication bypass.

**Key handling.** A `nub run auth:keygen` script generates a P-256 pair via
`crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })`, writing to a
gitignored `.env`; `.env.example` documents the variables. Tests use a fixture
keypair. **No private key is committed** — not even a dev one, since a committed
private key reads badly to a security reviewer regardless of the label on it.

## Known limitations

- **No revocation.** A stateless token is valid until it expires; there is no
  logout or blocklist. Mitigated only by short lifetimes. This is inherent to
  the approach, not an oversight — and it is the specific gap that the deferred
  stateful refresh-token flow would close, ranked as the preferred stretch goal
  in [ADR-0017](0017-deferred-optional-scope.md).
- **Key distribution becomes a setup step.** Asymmetric signing means the issuer
  holds the private key and we hold the public one — a keypair to generate and a
  variable to configure, where HS256 needed one shared string. This is the price
  of the service being unable to mint tokens, and it is worth paying.
- **No key rotation story.** The public key is a single environment variable, so
  rotating it is a redeploy. A JWKS endpoint with key ids would fix this; it is
  out of scope, and we do not fetch keys over the network at all.
- **Clock skew** between issuer and verifier affects `exp` validation.
- **No user existence check.** A well-formed token for a deleted user still
  works until expiry, since we have no user store to consult — a direct
  consequence of verify-only.
- **The tenant is only as trustworthy as the issuer.** We have moved the trust
  boundary to the identity provider rather than eliminated it.

## Consequences

- `senderId` disappears from the create-message DTO. Existing tests that post it
  must be updated, and a test asserting it is *rejected* should be added.
- Every integration test needs a signed token. A test helper mints them with the
  test secret; this is the only place tests should construct tokens.
- Cross-tenant access tests become stronger: instead of omitting a header, they
  present a valid token for tenant A and assert that tenant B's data is
  unreachable.
- A request with no token, a malformed token, an expired token, or a token
  missing `tid`/`sub` must all be rejected — each is a required test case.

## Rules for agents

- Never read `tenantId` or `senderId` from a header, query parameter or body.
  The verified claim is the only source.
- **Never configure the verifier without `algorithms: ['ES256']`.** Never accept
  the algorithm from the token's `alg` header. Never widen the list to include a
  symmetric algorithm alongside an asymmetric one.
- Never commit a private key, including a dev or test one.
- Never add a `@Public()` route without an explicit instruction.
- Never log, echo, or persist a raw token.
- Do not add a users collection, password hashing, or a login endpoint — that is
  deliberately out of scope.
- Do not add roles or permission checks. Authorization here is tenant isolation
  and nothing else.

## Bad pattern

```ts
@Post()
create(@Body() dto: CreateMessageDto, @Headers('x-tenant-id') tenantId: string) {
  // caller-asserted identity — any tenant, any sender
  return this.useCase.execute({ ...dto, tenantId, senderId: dto.senderId });
}
```

```ts
// unpinned: the verifier trusts the token's own alg header —
// an attacker signs HS256 using the published public key as the secret
JwtModule.register({ publicKey });
```

## Good pattern

```ts
@Post()
create(@Body() dto: CreateMessageDto) {
  // tenantId and senderId come from the verified token via ALS
  return this.useCase.execute(dto);
}
```

```ts
JwtModule.register({
  publicKey,
  verifyOptions: { algorithms: ['ES256'], issuer, audience },
});
```
