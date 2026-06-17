# IG-AUTH-0 — Instagram Authentication & Token Current-State Audit

## Metadata

| Field | Value |
| ----- | ----- |
| Agent | A |
| Date | 2026-06-17 |
| Task | IG-AUTH-0 — Instagram Authentication & Token Current-State Audit |
| Branch | `docs/ig-auth-0-current-state-audit` |
| Base master SHA | `c506c168542396f4a10298adf5ba21243ed8d4ad` |
| Scope | **Docs/report only** — no runtime, schema, env, or OAuth implementation changes |
| Related docs | [`ig-auth-token-consumer-matrix.md`](../../instagram/ig-auth-token-consumer-matrix.md), [`ig-oauth-migration-inputs.md`](../../instagram/ig-oauth-migration-inputs.md) |

## Executive summary

HubChat’s Instagram features today run on **Meta’s Page-linked Instagram Messaging model**: outbound and Graph enrichment use a **Facebook Page access token (`EA…`)** against `graph.facebook.com/{pageId}/…`, not Instagram Login tokens (`IGA…`). Inbound webhooks authenticate with **platform-level ENV secrets** (verify token + app secret), not per-tenant DB credentials. **No Instagram OAuth service or scheduled token refresh** exists in the codebase; Facebook OAuth covers connect-time exchange only.

Production baseline (operator smoke, prior agent reports) confirms DM text, DM image, and comment private reply PASS under `DB_WITH_ENV_FALLBACK`. This audit identifies **resolver / binding / webhook / test-connection split-brain** as the primary OAuth migration blockers.

---

## Auth families discovered (count: 5 + 1 schema-only)

| # | Family | Purpose | Where used |
| - | ------ | ------- | ---------- |
| 1 | **Facebook Page access token** (`EA…`) | IG DM, private reply, Graph enrichment, health probe | Worker outbound, Vercel webhook adapter, test connection |
| 2 | **Webhook verify token** | GET hub challenge | Vercel ENV only |
| 3 | **Meta app secret** | POST `X-Hub-Signature(-256)` HMAC | Vercel ENV only; route-specific precedence |
| 4 | **Credential encryption key** | Decrypt CC `channel_credentials` | Worker + Vercel when CC enabled |
| 5 | **Instagram Login token** (`IGA…`) | — | **Explicitly rejected** at outbound (`instagramAdapter.ts`) |
| 6 | **REFRESH_TOKEN** (credential type) | Schema/resolver field | **No runtime consumer** |

**Important:** App secret ≠ access token. Webhook verify token ≠ app secret.

---

## Process-boundary audit

### Vercel (API / webhooks)

| Concern | Implementation |
| ------- | -------------- |
| Env parsing | Next.js `process.env` directly; channel test uses `channel_settings` DB |
| Webhook verify/sign | `src/interfaces/api/webhook/facebook.ts`, `instagram.ts`, `webhookSignature.ts` |
| Inbound adapter token | `createInstagramWebhookHandler` builds adapter from ENV (`INSTAGRAM_ACCESS_TOKEN` ?? `FACEBOOK_PAGE_ACCESS_TOKEN`) |
| Source post Graph | `InstagramAdapter.fetchMediaDetailFromGraph` at webhook time |
| Profile lookup | `InstagramAdapter.fetchUserProfile` at webhook time |
| Test connection | `TestChannelConnectionUseCase` → `verifyInstagramChannelHealth` (DB token only) |
| OAuth | **Facebook only** — no Instagram OAuth routes |

### Railway (worker)

| Concern | Implementation |
| ------- | -------------- |
| Env parsing | `parseWorkerEnv` (`src/lib/workerEnv.ts`) — zod subset; undeclared keys stripped unless read from `process.env` elsewhere |
| Outbound resolver | `createInstagramOutboundAdapterResolver` → `resolveInstagramWorkerOutboundConfig` (`worker/main.ts`) |
| CC decrypt | `SupabaseChannelConnectionRepository` + `resolveChannelCredentialEncryptionKey` (post PR #237) |
| Source post worker | `resolveSourcePostMetadataForInbound` — **Facebook comment Graph only**; passes `FACEBOOK_PAGE_ACCESS_TOKEN` |
| Profile avatar cache | `ProfileAvatarCacheWorker` — **opt-in** (`HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED` default off) |
| Token refresh | **None** |

### Vercel vs Railway comparison

| Dimension | Match? | Evidence |
| --------- | ------ | -------- |
| Resolver implementation | **Partial** | Shared libs (`channelConnectRuntimeResolver`, `instagramOutboundRuntimeConfig`); Vercel test connection bypasses worker resolver |
| Env key names | **Mostly** | Same token env vars; worker uses parsed `WorkerEnv` subset |
| Env normalization | **Partial** | Worker coerces numeric fields via zod; encryption key uses canonical loader with `process.env` fallback (PR #237) |
| DB decrypt | **Worker only** for outbound send | Vercel test connection reads `channel_settings` secrets via repository, not CC decrypt path for IG test |
| Connection binding | **Neither fully** | Facebook outbound passes `channelConnectionId`; Instagram does not |
| Fallback behavior | **Worker only** | `DB_WITH_ENV_FALLBACK` in worker; Vercel test has no env fallback |

**Regression lesson (Facebook PR #237):** Worker startup logged `encryptionKeyConfigured` from `process.env` while resolver pre-check read stripped `WorkerEnv` → false `encryption_key_missing`. Instagram outbound passes parsed `env` into `resolveOutboundChannelCredential`; any future Instagram-specific env keys must follow the same canonical-loader pattern or be added to `workerEnvSchema`.

---

## Path audits (required trace format)

### 1. Instagram DM outbound — text

```text
Feature: IG DM text outbound
Entry point: POST /api/messages/send (app/api/messages/send/route.ts)
Application use case: SendOutboundMessageUseCase.execute (sendOutboundMessage.ts)
Queue topic/job: message.outbound.requested (outboundWorker.ts OUTBOUND_QUEUE_TOPIC)
Worker handler: OutboundWorker.runOnce → SendOutboundMessageUseCase
Adapter/provider client: InstagramAdapter.sendMessage (instagramAdapter.ts)
Endpoint: POST https://graph.facebook.com/{version}/{pageId}/messages?access_token=…
HTTP method: POST
Provider account/resource IDs: pageId from resolver; recipient IGSID from channelThreadId ig:user:{id}
Credential resolver: resolveInstagramWorkerOutboundConfig → resolveInstagramOutboundConfig / tryResolveInstagramFromChannelConnect
Token/config field: ACCESS_TOKEN (DB/CC/settings/env); pageId from providerPageId
Token family: Facebook Page access token (EA…)
Credential source: DB_WITH_ENV_FALLBACK precedence (CC if flag on → channel_settings → env)
Tenant binding: payload.tenantId
Connection binding: tenant-level only — resolve(tenantId) without channelConnectionId (sendOutboundMessage.ts L118-119)
Expiry behavior: token_expires_at not checked before send
Refresh behavior: none
Failure behavior: outside-window → terminal; other errors → RetryableOutboundDeliveryError + queue backoff
Result persistence: messages.delivery_status, external_message_id; queue terminal state
Relevant tests: sendOutboundMessage.test.ts, instagramAdapter.test.ts, messagesSend.route.test.ts
Evidence files: sendOutboundMessage.ts, instagramAdapter.ts, instagramOutboundRuntimeConfig.ts, createInstagramOutboundAdapterResolver.ts
Migration impact: NEEDS_RESOLVER_CHANGE, NEEDS_CONNECTION_BINDING_FIX
```

### 2. Instagram DM outbound — image

```text
Feature: IG DM image outbound
Entry point: POST /api/messages/upload-image then POST /api/messages/send
Application use case: Same SendOutboundMessageUseCase; routeUsed INSTAGRAM_SEND
Queue topic/job: message.outbound.requested
Worker handler: Same OutboundWorker path
Adapter/provider client: InstagramAdapter.sendMessage messageType IMAGE
Endpoint: Same POST …/{pageId}/messages (optional 2nd POST for caption text)
HTTP method: POST
Provider account/resource IDs: Same as text
Credential resolver: Identical to text path
Token family: Same Page token
Credential source: Same as text
Tenant binding: Same
Connection binding: Same (no per-conversation binding)
Expiry behavior: Same
Refresh behavior: none
Failure behavior: validateInstagramOutboundImageMedia (mediaPolicy.ts); caption failure non-fatal after image sent
Result persistence: message_type IMAGE + media columns in RPC
Relevant tests: sendOutboundMessage.test.ts (image cases), instagramAdapter.test.ts
Evidence files: sendOutboundMessage.ts L281-296, instagramAdapter.ts L664-760
Migration impact: OAUTH_READY endpoint-wise; shares text resolver gaps
```

**Conclusion:** Image and text share one route (`INSTAGRAM_SEND` → `sendMessage`); only request body differs.

### 3. Instagram comment private reply

```text
Feature: IG comment private reply (first reply)
Entry point: POST /api/messages/send on INSTAGRAM_COMMENT conversation
Application use case: resolveInstagramOutboundRoute → INSTAGRAM_PRIVATE_REPLY (sendOutboundMessage.ts L350-374, L796-838)
Queue topic/job: message.outbound.requested
Worker handler: OutboundWorker → SendOutboundMessageUseCase
Adapter/provider client: InstagramAdapter.sendPrivateReply
Endpoint: POST …/{pageId}/messages with recipient.comment_id
HTTP method: POST
Provider account/resource IDs: commentId from conversation; pageId from conversation.providerPageId
Credential resolver: Same tenant-level Instagram resolver (not page-scoped)
Token family: Page access token (same as DM)
Credential source: Same as DM
Tenant binding: tenantId
Connection binding: route uses conversation page; credentials not scoped to that page
Expiry behavior: 7-day eligibility window (conversation.lastMessageAt) — local gate, not token expiry
Refresh behavior: none
Failure behavior: eligibility fail → terminal before adapter; provider fail → queue retry
Result persistence: markInstagramCommentPrivateReplySent (private_reply_sent_at, private_reply_comment_id)
Relevant tests: sendOutboundMessage.test.ts private reply cases; instagramAdapter.test.ts L442-486
Evidence files: sendOutboundMessage.ts, instagramAdapter.ts, supabaseConversationRepository.ts
Migration impact: NEEDS_CONNECTION_BINDING_FIX (page/token alignment)
```

### 4. Source Post enrichment

**Both webhook Graph and payload passthrough exist.**

| Sub-path | Mechanism | Token |
| -------- | --------- | ----- |
| Webhook passthrough | Payload / adapter builds `source_post_snippet`, `source_post_thumbnail_url` | N/A |
| Webhook Graph | `InstagramAdapter.fetchMediaDetailFromGraph` on comment `mediaId` | Vercel ENV Page token |
| Worker Graph fallback | `resolveSourcePostMetadataForInbound` | **Facebook comments only** — `FACEBOOK_PAGE_ACCESS_TOKEN` |
| Worker Instagram | Returns `not_applicable` if webhook metadata empty | No token |

```text
Feature: Source Post enrichment
Entry point: Webhook POST → outbox → ProcessInboundMessageUseCase
Application use case: resolveSourcePostMetadataForInbound (sourcePostIngestEnrichment.ts)
Worker handler: inbound worker → processInboundMessage
Endpoint (when Graph): GET graph.facebook.com/{version}/{mediaId}?fields=…
Credential source: Webhook ENV for IG Graph; worker uses Facebook ENV only
Failure behavior: enrichment failure must not fail ingest (not_applicable / swallow)
HTTPS sanitization: sourcePostThumbnailSanitize.ts, buildSafeSourcePostMetadata
Migration impact: NEEDS_TOKEN_FAMILY_DECISION, NEEDS_ENDPOINT_CHANGE for worker parity
Evidence: sourcePostIngestEnrichment.ts L108-116, instagramAdapter.ts L370-394, processInboundMessage.ts L456-465
```

### 5. Profile lookup

| Sub-feature | Status | Evidence |
| ----------- | ------ | -------- |
| Graph `profile_pic` fetch at webhook | **Active** | `instagramAdapter.ts` `fetchUserProfile` |
| Avatar cache to Supabase | **Parked / opt-in** | `isProfileAvatarCacheEnabled` default false (`.env.example` L52) |
| Production consumer of cache worker | **No evidence of enabled flag** | Flag must be `true`/`1` on Railway |

```text
Feature: Profile lookup / avatar enrichment
Entry point: Instagram webhook receiveMessage
Endpoint: GET graph.facebook.com/{version}/{igsid}?fields=name,profile_pic
Token family: Page token (webhook ENV)
App Review: implied by parked cache + profile_pic field usage
Failure behavior: empty profile object; ingest continues
Migration impact: NEEDS_PERMISSION_OR_APP_REVIEW
```

### 6. Health / Test connection

```text
Feature: Channel Settings test connection (Instagram)
Entry point: POST /api/channel-settings/instagram/test-connection
Application use case: TestChannelConnectionUseCase.execute (testChannelConnection.ts)
Credential resolver: getRuntimeConfigForConnectionTest — channel_settings DB ONLY for Instagram
Provider probe: verifyInstagramChannelHealth — GET /{pageId}?fields=instagram_business_account{…}
READY meaning: Graph confirms IG business account linked to configured Page ID
OAuth path: Facebook-only tryOAuthManagedFacebookRuntime — skipped for INSTAGRAM
DB vs env: test never exercises worker env fallback
Expired token: probe fails → ERROR; worker may still send via env fallback
Migration impact: NEEDS_RESOLVER_CHANGE (align test with runtime resolver)
Evidence: testChannelConnection.ts L122-172, channelHealthCheck.ts L129-184
```

### 7. Webhook authentication

| Route | GET verify token | POST app secret order | Edge enforcement |
| ----- | ---------------- | --------------------- | ---------------- |
| `/api/webhook/facebook` | `FACEBOOK_VERIFY_TOKEN` | `FACEBOOK_APP_SECRET` → `META_APP_SECRET` | Handler-only for POST |
| `/api/webhook/instagram` | `INSTAGRAM_VERIFY_TOKEN` ?? `FACEBOOK_VERIFY_TOKEN` | `INSTAGRAM_APP_SECRET` → `FACEBOOK_APP_SECRET` → `META_APP_SECRET` | Route returns 401 + handler |
| Facebook route + `object=instagram` | Same as Facebook GET | **Facebook secret order** (not Instagram-first) | Delegates to IG handler after FB signature |

Algorithms: `sha256` preferred (`X-Hub-Signature-256`), legacy `sha1` fallback (`webhookSignature.ts`).

DB `channel_settings` verify/app secrets affect UI `configured` gate only — **not** webhook handlers (CCP-0 audit alignment).

### 8. Token refresh

| Mechanism | Instagram | Facebook |
| --------- | --------- | -------- |
| OAuth connect-time exchange | **None** | `facebookOAuthService.ts`, `facebookGraphOAuth.ts` |
| Scheduled / lazy refresh | **None** | **None** (expiry stored, no cron) |
| `REFRESH_TOKEN` credential type | Schema only | Schema only |
| Retry-on-expiry for IG code 190 | Generic retryable | Facebook has token-expired terminal classifier |

---

## Findings

### P0 — Security / tenant isolation

#### P0-1: Inbound webhook auth is platform-global ENV

- **Affected path:** All webhook POST/GET
- **Evidence:** `verifyFacebookWebhook`, `verifyInstagramWebhook`, `evaluateMetaHubWebhookSignature` read `process.env` only
- **Current behavior:** Single verify token + app secret per deployment
- **Risk:** Multi-tenant product model assumes per-tenant secrets in DB UI, but ingress auth is not tenant-scoped
- **OAuth migration impact:** Must decide platform vs per-tenant webhook credentials
- **Next investigation:** CC inbound resolver `APP_SECRET` path vs webhook reality

#### P0-2: Instagram outbound credentials are tenant-global (no connection binding)

- **Affected path:** Worker IG outbound resolver
- **Evidence:** `createInstagramOutboundAdapterResolver.resolve(tenantId)` — no `channelConnectionId`/`providerPageId` (`sendOutboundMessage.ts` L118-119 vs Facebook L112-116)
- **Current behavior:** `tryResolveInstagramFromChannelConnect` calls `resolveOutboundChannelCredential` without page scope (`resolveWorkerOutboundWithChannelConnect.ts` L180-191)
- **Risk:** Wrong Page token if multiple IG connections per tenant
- **OAuth migration impact:** NEEDS_CONNECTION_BINDING_FIX before multi-connection tenants
- **Next investigation:** Production count of READY IG connections per tenant

### P1 — OAuth migration blocker / production reliability

#### P1-1: No Instagram OAuth implementation

- **Evidence:** Zero `instagramOAuth` / Instagram OAuth routes in `src/`
- **Impact:** All IG tokens are manual Channel Settings or env injection
- **Classification:** UNKNOWN_EVIDENCE_MISSING for flow design; NEEDS_TOKEN_FAMILY_DECISION

#### P1-2: Test connection ≠ runtime credential path

- **Evidence:** Test uses `channel_settings` only; worker uses `DB_WITH_ENV_FALLBACK` + optional CC
- **Risk:** READY in UI while worker uses stale DB + env fallback or different token
- **Classification:** NEEDS_RESOLVER_CHANGE

#### P1-3: `DB_WITH_ENV_FALLBACK` can mask DB token problems

- **Evidence:** `resolveInstagramOutboundConfig` L133-146 returns env when DB missing
- **Risk:** Expired/missing DB credential hidden if Railway env token valid
- **Classification:** NEEDS_REFRESH_REDESIGN + operational monitoring

#### P1-4: Instagram lacks OAuth fail-closed (`blockLegacyFallback`)

- **Evidence:** Facebook OAuth outbound blocks env fallback; Instagram has no equivalent in resolver
- **Classification:** NEEDS_RESOLVER_CHANGE for parity with Facebook OAuth

#### P1-5: Source post worker path has no Instagram Graph fallback

- **Evidence:** `sourcePostIngestEnrichment.ts` Instagram branch webhook-metadata-only
- **Risk:** Missing thumbnail/snippet if webhook payload sparse
- **Classification:** NEEDS_ENDPOINT_CHANGE

#### P1-6: Instagram events on Facebook webhook URL use Facebook app secret order

- **Evidence:** `facebook.ts` delegate after FB signature; `ROUTE_SECRET_SOURCE_ORDER` differs per route
- **Risk:** Signature verify with wrong secret if apps differ
- **Classification:** NEEDS_TOKEN_FAMILY_DECISION

### P2 — Observability / maintainability

#### P2-1: No Instagram-specific token-expired terminal classification

- **Evidence:** `classifyOutboundProviderFailure` — `isFacebookTokenExpiredError` only when `channel === "FACEBOOK"`
- **Impact:** Meta 190 on Instagram → generic retryable errors

#### P2-2: Profile avatar cache disabled by default

- **Evidence:** `isProfileAvatarCacheEnabled` requires explicit `true`/`1`

#### P2-3: Duplicate signature verification on Instagram route

- **Evidence:** Route 401 + handler verify

#### P2-4: `token_expires_at` helper not used in outbound gate

- **Evidence:** `resolveCredentialStateFromExpiry` exists (`channelConnectionLifecycle.ts`) but not called from `channelConnectRuntimeResolver` outbound path

---

## Required conclusions (direct answers)

| # | Question | Answer |
| - | -------- | ------ |
| 1 | How many Instagram auth families? | **5 runtime** (+1 schema-only REFRESH_TOKEN): Page access token, verify token, app secret, encryption key, rejected IGA token |
| 2 | Which consumers use each family? | See [`ig-auth-token-consumer-matrix.md`](../../instagram/ig-auth-token-consumer-matrix.md) |
| 3 | DM text and image same credential path? | **Yes** — `INSTAGRAM_SEND` → `sendMessage` |
| 4 | Private reply same token as DM? | **Yes** — same Page token resolver; different adapter method |
| 5 | Source Post enrichment token or passthrough? | **Both** — webhook Graph + passthrough; worker IG has passthrough only |
| 6 | Profile lookup status? | **Lookup active** at webhook; **avatar cache parked** (flag off by default) |
| 7 | Test connection same credential as runtime? | **No** — test uses `channel_settings` DB; runtime worker resolver + fallback |
| 8 | Webhook secrets per route? | Instagram route: IG verify + IG app secret first; Facebook route: FB verify + FB app secret; IG-on-FB uses FB order |
| 9 | Refresh supports which families? | **Connect-time Facebook OAuth only**; nothing for Instagram |
| 10 | Refresh runs where? | **Vercel OAuth callback only** — not worker, not scheduled |
| 11 | Can `DB_WITH_ENV_FALLBACK` hide expiry? | **Yes** — env can mask missing/expired DB token; expiry not enforced on send |
| 12 | All paths enforce tenant_id + channel_connection_id? | **tenant_id yes**; **channel_connection_id not for IG outbound** (Facebook outbound does pass it) |
| 13 | Top OAuth migration blocker? | **No Instagram OAuth + tenant-global resolver without connection binding + test/runtime split** |
| 14 | Unknowns needing production evidence? | CC resolver flag state in prod; credential store in use per tenant; `token_expires_at` population; App Review status for profile_pic |

---

## Verification (this PR)

| Check | Result |
| ----- | ------ |
| Docs-only diff | Yes — only `docs/**` |
| `git diff --check` | Run at commit time |
| Secret scan | Run at commit time |
| Full test suite | Not required for docs-only per task brief |

---

## Scope confirmation

```text
Docs/report only.
No runtime change.
No schema/migration change.
No environment or production credential change.
No OAuth implementation.
No token resolver behavior change.
No deployment performed.
```

---

## Reviewer notes (Agent B)

- Validate production `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` and credential store (settings vs CC) before IG OAuth design.
- Compare findings with Facebook OAuth lessons (PR #233–#237).
- Do not merge without independent review.
