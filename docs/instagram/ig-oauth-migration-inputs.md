# IG-AUTH-0 — Instagram OAuth Migration Inputs (Evidence-Based)

> **Status:** Inputs only — no OAuth design in this document.  
> **Base master SHA:** `c506c168542396f4a10298adf5ba21243ed8d4ad`

## Proven inputs for a future Instagram OAuth design

### Credential outputs OAuth must produce

| Output | Evidence why needed | Current storage |
| ------ | ------------------- | --------------- |
| Facebook Page access token (`EA…`) for `/{pageId}/messages` | `instagramAdapter.ts` rejects `IGA…` tokens; all outbound uses Page token | `channel_settings.accessToken` or CC `ACCESS_TOKEN` |
| Facebook Page ID (`providerPageId`) | Required in adapter config + health probe | `channel_settings.config_json.providerPageId`, CC `provider_page_id` |
| Instagram Business Account ID (optional) | `INSTAGRAM_ACCOUNT_ID` / `providerIgAccountId` passed to adapter | Env or CC metadata |
| `token_expires_at` | Column exists; Facebook OAuth already persists | `channel_credentials.token_expires_at` |
| Encrypted at rest | CC path uses `encryptChannelCredentialPlaintext` | `channel_credentials.encrypted_secret_value` |

### Identifiers OAuth must bind

| Identifier | Used by | Binding today |
| ---------- | ------- | ------------- |
| `tenant_id` | All paths | Enforced on repository queries |
| `channel_connection_id` | Facebook outbound (post hotfix) | **Not passed** for Instagram outbound (`sendOutboundMessage.ts` L118–119) |
| `provider_page_id` | Private reply route, health check | Conversation field for route; credentials tenant-global |
| IGSID (`ig:user:{id}`) | DM recipient | `conversations.channel_thread_id` |
| `provider_comment_id` | Private reply | `conversations.provider_comment_id` |
| `public_connection_key` | Inbound CC verification (future) | CC schema exists; webhooks still ENV |

### Consumers changeable by credential-source swap only

| Consumer | Can swap DB/OAuth token without endpoint change? | Notes |
| -------- | ------------------------------------------------ | ----- |
| IG DM text/image | **Yes** — same `InstagramAdapter.sendMessage` | Must keep Page token family |
| IG private reply | **Yes** — `sendPrivateReply` | Must align `pageId` with token owner |
| Test connection | **Partial** — needs CC/OAuth resolver path like Facebook | Today DB `channel_settings` only |
| Webhook verify/sign | **No** — remains ENV app-level unless architecture changes | Documented CCP-0 gap |
| Source post Graph (webhook) | **Partial** — needs resolver-fed token on Vercel | Today webhook ENV only |
| Profile Graph lookup | **Partial** — same as source post | Active at webhook; App Review gated |

### Consumers tied to Facebook Page–linked Instagram model

All current Graph calls use `graph.facebook.com` with a **Page access token**, consistent with Meta’s Page-linked Instagram Messaging API — not Instagram Basic Display / Instagram Login standalone tokens.

Evidence: `instagramAdapter.ts` Page token assertion; health check `instagram_business_account` subfield on Page node (`channelHealthCheck.ts`).

### Permission / App Review blockers (code expectations)

| Capability | Code expectation | Status |
| ---------- | ---------------- | ------ |
| Instagram messaging send | `/{pageId}/messages` | Production smoke PASS per baseline |
| Private reply | `recipient.comment_id` | Production smoke PASS |
| `profile_pic` lookup | `fields=name,profile_pic` on IGSID | Implemented; **avatar cache parked** pending review (`.env.example` worker-only flags default off) |
| Instagram business account linkage | Health probe requires `instagram_business_account.id` | Test connection depends on this |

### Refresh ownership today

| Location | Behavior |
| -------- | -------- |
| Vercel Facebook OAuth | Connect-time `fb_exchange_token` + page token exchange (`facebookOAuthService.ts`) |
| Railway worker | **No refresh loop** |
| Instagram | **No refresh path in codebase** |
| `REFRESH_TOKEN` credential type | Schema/resolver mapping only |

**Migration risk:** OAuth without scheduled refresh repeats Facebook manual re-auth ops burden unless designed.

### Fallback risks for migration

| Risk | Evidence |
| ---- | -------- |
| `DB_WITH_ENV_FALLBACK` masks stale DB token | `resolveInstagramOutboundConfig` returns env credentials when DB miss (`instagramOutboundRuntimeConfig.ts` L133–146) |
| Test connection can PASS while worker uses env fallback | Test uses `channel_settings` only; worker may fall back to Railway env |
| Worker parsed-env subset | `parseWorkerEnv` strips undeclared keys; encryption key regression fixed in PR #237 via `resolveChannelCredentialEncryptionKey` fallback — **audit lesson for any new env keys** |
| Instagram lacks `blockLegacyFallback` | Facebook OAuth has fail-closed OAuth path; Instagram has no equivalent (`channelConnectRuntimeResolver.ts` OAuth helpers are Facebook-only) |

### Suggested migration classification by consumer

| Consumer | Classification |
| -------- | -------------- |
| IG DM text/image | `NEEDS_RESOLVER_CHANGE` + `NEEDS_CONNECTION_BINDING_FIX` |
| IG private reply | `NEEDS_CONNECTION_BINDING_FIX` |
| Test connection | `NEEDS_RESOLVER_CHANGE` |
| Webhook auth | `NEEDS_TOKEN_FAMILY_DECISION` (platform ENV vs per-tenant) |
| Source post enrichment | `NEEDS_TOKEN_FAMILY_DECISION` + `NEEDS_ENDPOINT_CHANGE` (worker parity) |
| Profile lookup/cache | `NEEDS_PERMISSION_OR_APP_REVIEW` |
| Token refresh | `NEEDS_REFRESH_REDESIGN` |
| CC credential storage | `OAUTH_READY` (reuse Facebook model) |
| Instagram OAuth service | `UNKNOWN_EVIDENCE_MISSING` (no implementation exists) |

### Unknowns requiring production/provider evidence

1. Whether production `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` is on for Instagram CC DB path (baseline says resolver flag historically off; modes are `DB_WITH_ENV_FALLBACK`).
2. Whether tenants store Instagram credentials in `channel_settings`, `channel_connections`, or env only in production.
3. Actual `token_expires_at` population for Instagram/manual rows.
4. Whether Meta returns long-lived Page tokens with expiry for Instagram-linked Pages in current app configuration.
5. Whether profile lookup is blocked in production Graph responses (App Review) vs only cache worker disabled.
