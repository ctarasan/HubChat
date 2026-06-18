# IG-AUTH-2B — Queue and Resolver Exposure Matrix

Audit baseline: master `6a709fb` (post IG-AUTH-2A). **Pre-2B:** queue payload has no OAuth binding fields; Instagram uses legacy env-fallback resolver.

References: [`ig-oauth-architecture-adr.md`](ig-oauth-architecture-adr.md) ADR-2 (queue carries `channelConnectionId`), ADR-6 (OAuth DB-only, fail closed), IG-AUTH-1B delivery-path invariant.

---

## Risk legend

| Level | Meaning |
|-------|---------|
| **Current** | Risk on master today |
| **2B-new** | Risk if IG-AUTH-2B adds fields without guards |
| **Target** | Required end state after 2B |

---

## Exposure matrix

| Surface | Stored/displayed data | Secret risk | Connection ID risk | Required protection | Existing test |
| ------- | --------------------- | ----------- | ------------------ | ------------------- | ------------- |
| Queue DB row (`queue_jobs.payload_json`) | `OutboundMessageRequestedPayload`: tenantId, messageId, conversationId, channel, channelThreadId, content, media — **no token** | **2B-new:** accidental token/ciphertext in payload extension | **2B-new:** `channelConnectionId` acceptable if no secrets | Allowlist only; forbidden-field rejection at enqueue; no credential snapshots | `dbQueue.test.ts`; outbound worker mock payloads |
| Queue retry | Same `payload_json` on retry — not mutated | Same as row | Same | Retry must not append resolver output to payload | `dbQueue.test.ts` markFailed |
| Queue dead letter | `payload_json` + `last_error` | **Current:** stack in `last_error` may embed tokens if unsanitized | Low | `formatErrorForStorage` + `sanitizeProviderErrorMessage`; block token patterns | TOKEN_LIKE guards in resolver tests |
| Outbox relay | Relays outbound payload to `message.outbound.requested` | Same as queue | Same | Same allowlist when relaying | `outboxRelayWorker.test.ts` |
| Worker outbound handler | Logs tenantId, conversationId, messageId, channel — not full payload | Low if structured only | Low | Never log full payload or resolved credentials | `outboundWorker.test.ts` |
| Worker stdout/stderr JSON | `workerJsonConsole.ts` arbitrary objects | **Current:** unguarded if caller passes secrets | Medium if connectionId logged broadly | TOKEN_LIKE guard or field allowlist | `workerJsonConsole.test.ts` |
| Send outbound use case | Adapter with `conversation.channelConnectionId`; route metadata logged | **Current:** token in memory only | **Current:** connection from conversation, not queue | 2B: explicit binding; never log resolved config | `sendOutboundMessage*.test.ts` |
| Channel Connect resolver | `ResolvedOutboundChannelCredential` — internal only | Facebook OAuth uses sanitized diagnostics | connectionId in diagnostics | Instagram OAuth: mirror `blockLegacyFallback` | `channelConnectRuntimeResolver.test.ts` |
| Worker CC integration | Legacy env fallback on miss (except `blockLegacyFallback`) | **Current:** IG `DB_WITH_ENV_FALLBACK` uses env tokens | Resolver uses tenant + optional connectionId | OAuth: no legacy fallback; log `resolutionPath` only | `resolveWorkerOutboundWithChannelConnect.test.ts` |
| Instagram legacy config | `loadEnvInstagramCredentials` reads env tokens | **Current P1:** env fallback masks DB gaps | Tenant-global, not per-connection | OAuth-managed connections must not use this path | `sendOutboundMessage.instagramRuntimeConfig.test.ts` |
| Ops runtime API | Counts, dead-letter reason codes — no payload | Low | Low | Must not add payload preview endpoints | `opsRuntime.route.test.ts` |
| Ops UI | Health reasons; dead_letter code parsing | Low | Low | No connection binding detail in ADMIN UI | `opsRuntimeModel.test.ts` |
| API errors | `toClientErrorDetail` / sanitized messages | Depends on throw site | Low | Resolver errors use sanitized codes | Route tests |
| Activity logs | Outbound metadata (message ids, route) | Low | Low | No credential fields in metadataJson | Send outbound tests |
| Test fixtures | Placeholder tokens in env mocks | Snapshot leak risk | Test UUIDs for connections | must-not-appear patterns | Partial |
| Audit / retention | Blocks `access_token`, `payload_json` in error strings | Good pattern | N/A | Extend to IG-AUTH-2B error paths | retention tests |
| Observability metrics | Counts by topic/status | Low | Low | No per-connection credential metrics | `runtimeStatsSnapshot.test.ts` |

---

## Potential exposure paths (priority)

1. **Queue payload credential snapshot** — token, ciphertext, or decrypt output in `payload_json`.
2. **OAuth failure → ENV fallback** — Instagram resolver uses `DB_WITH_ENV_FALLBACK` when OAuth credential missing.
3. **Stale credential binding** — queue stores `credentialId`/`credentialVersion` as authoritative after rotation.
4. **Connection switching** — resolver ignores queue `channelConnectionId`, picks tenant-global or latest active.
5. **last_error leakage** — provider URL with `access_token=` in `formatErrorForStorage` output.
6. **Worker log of resolved config** — full `ResolvedOutboundChannelCredential` logged.
7. **Ops payload preview** — debugging endpoint exposing `payload_json` without redaction.
8. **Cross-tenant inference** — errors confirming connection exists under another tenant.

---

## Allowed queue fields (IG-AUTH-2B contract)

| Field | Notes |
|-------|-------|
| `provider` | `INSTAGRAM` |
| `authFamily` | e.g. `INSTAGRAM_BUSINESS_LOGIN` \| `LEGACY_FACEBOOK_PAGE` |
| `deliveryPath` | e.g. `OAUTH_DB` \| `LEGACY_DB`; OAuth + `ENVIRONMENT_FALLBACK` **invalid** |
| `channelConnectionId` | UUID; authoritative binding for OAuth path |
| `contractVersion` | Rolling compatibility |
| Existing payload fields | tenantId, messageId, conversationId, channel, channelThreadId, content, media |

## Forbidden queue fields

```text
accessToken
ciphertext
authorizationCode
appSecret
verifyToken
secretFingerprint
rawProviderResponse
encryptionKey
Authorization
decryptedSecret
instagram_oauth_credentials row blobs
```

## credentialId / credentialVersion in queue

**Discouraged.** If included for diagnostics: non-authoritative only; worker resolves current credential by `tenantId` + `channelConnectionId` at execution.

**Principle:** Queue binds connection. Worker resolves current credential.

---

## Current vs target: outbound binding flow

**Current (master):**

```text
API → outbox/queue (no channelConnectionId in payload)
    → worker → conversation.channel_connection_id (nullable)
    → resolveInstagramOutboundConfig (DB_WITH_ENV_FALLBACK + env)
```

**Target (IG-AUTH-2B):**

```text
API → queue (+ channelConnectionId, authFamily, deliveryPath, contractVersion)
    → worker → resolveInstagramOAuthCredential(tenantId, channelConnectionId, ...)
    → decrypt in-process only → adapter send
    → OAuth: DB_ONLY, blockLegacyFallback=true
```

---

## Logging and error sanitization reference (existing)

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| `TOKEN_LIKE` | `channelConnectRuntimeDiagnostics.ts` | Blocks EA…/Bearer/access_token= in diagnostic JSON |
| `sanitizeProviderErrorMessage` | `sanitizeProviderError.ts` | Strips provider error bodies |
| `formatErrorForStorage` | `formatErrorForStorage.ts` | Bounded queue `last_error` text |
| `blockLegacyFallback` | `ChannelConnectRuntimeResolverError` | Facebook OAuth — extend to Instagram OAuth |
