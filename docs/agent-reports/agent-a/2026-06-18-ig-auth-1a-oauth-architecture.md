# IG-AUTH-1A — Instagram OAuth Architecture and Migration Decision

## Metadata

| Field | Value |
| ----- | ----- |
| Agent | A |
| Date | 2026-06-18 |
| Task | IG-AUTH-1A — Instagram OAuth Architecture and Migration Decision |
| Branch | `docs/ig-auth-1a-oauth-architecture` |
| Base master SHA | `54f9389494e4038d4e63106c2ceb94ac332fafc2` |
| Prerequisites | IG-AUTH-0 ([#238](https://github.com/ctarasan/HubChat/pull/238)), IG-AUTH-0B ([#239](https://github.com/ctarasan/HubChat/pull/239)) merged |
| Audit baseline | P0 **0**, P1 **8**, P2 **4** |
| Scope | **Docs/architecture only** — no runtime, schema migration, OAuth routes, worker/resolver change, env, or deployment |

## Deliverables

| Document | Purpose |
| -------- | ------- |
| [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md) | ADR-1 through ADR-10 + target decision matrix |
| [`ig-oauth-consumer-migration-matrix.md`](../../instagram/ig-oauth-consumer-migration-matrix.md) | Per-consumer migration + endpoint evidence |
| [`ig-oauth-token-lifecycle.md`](../../instagram/ig-oauth-token-lifecycle.md) | State machine, refresh ownership, provider TTLs |
| [`ig-oauth-rollout-rollback-plan.md`](../../instagram/ig-oauth-rollout-rollback-plan.md) | Phases 0–11, flags, rollback |

---

## Executive summary

HubChat must migrate Instagram runtime credentials from the **current Facebook Page-linked model** (Page access token `EA…` on `graph.facebook.com/{pageId}/…`) to **Instagram API with Instagram Login** using **Business Login for Instagram** and **Instagram User access tokens** on `graph.instagram.com/{IG_ID}/…`.

This is **not** a token-only swap. Official Meta documentation (checked **2026-06-18**) shows different OAuth flows, permission names, API hosts, and account identifiers between the two integration paths. HubChat `instagramAdapter.ts` today explicitly rejects Instagram Login tokens (`IGA…`) and requires Page tokens — implementation must add a parallel OAuth-managed path.

**Recommended target auth family:**

```text
Primary:     Instagram User access token (Business Login for Instagram)
Legacy:      Facebook Page access token (phased per connection)
End state:   OAuth-managed connections — DB credential only, blockLegacyFallback, no silent ENV fallback
```

**Architecture pillars:**

1. **Connection-bound credentials** — every consumer resolves via `tenant_id` + `channel_connection_id` (fixes IG-AUTH-0 P1-2).
2. **Unified resolver** — test connection and worker share `resolveInstagramCredential` (fixes IG-AUTH-0 P1-4).
3. **Scheduled token refresh** — dedicated maintenance job; terminal `REAUTH_REQUIRED` on expiry (fixes refresh gap + queue retry risk).
4. **Phased canary rollout** — Phases 0–11; no big-bang.
5. **Webhook app-level auth unchanged** — signature verification before routing; map provider IG account ID → connection.

---

## Target decision matrix (summary)

Full matrix: [`ig-oauth-architecture-adr.md`](../../instagram/ig-oauth-architecture-adr.md).

| Dimension | Current | Target | Consequence |
| --------- | ------- | ------ | ----------- |
| Facebook Page required | Yes | No (Instagram Login) | New identity model |
| Token owner | Facebook Page | IG professional account | New auth family |
| DM / private reply host | `graph.facebook.com` | `graph.instagram.com` | Adapter rewrite |
| Webhook auth | App-level ENV secret | Same | Routing map only |
| Refresh | None | `ig_refresh_token` job | New subsystem |
| Multi-connection | Tenant-global (P1) | Per `channel_connection_id` | Schema + resolver |

---

## Architecture decisions (ADR index)

| ADR | Title | Decision |
| --- | ----- | -------- |
| ADR-1 | Authentication family | Instagram User token primary; Page token legacy window |
| ADR-2 | Connection-bound ownership | Required `channel_connection_id` on queue + resolver |
| ADR-3 | Credential schema | Extended `channel_connections` / `channel_credentials`; no plaintext metadata |
| ADR-4 | OAuth security | `oauth_transactions` pattern; **PKCE not documented** — do not assume |
| ADR-5 | Token lifecycle | Access-token-only refresh; scheduled job owner |
| ADR-6 | Runtime resolver | `resolveInstagramCredential` with capabilities; fail closed |
| ADR-7 | Test/runtime parity | Same resolver + connection binding |
| ADR-8 | Consumer migration | Endpoint + permission changes per consumer matrix |
| ADR-9 | Webhooks | App-level signature; provider ID → connection map; compatibility routes |
| ADR-10 | Rollout | Phased canary Phases 0–11 |

---

## App Review and permissions matrix

**Checked against Meta docs 2026-06-18.** HubChat production App Review status is **not in repository** — marked UNKNOWN where applicable.

| Capability | Required permission (Instagram Login target) | Access level | App Review required | Existing approval status | Evidence missing |
| ---------- | -------------------------------------------- | ------------ | ------------------- | ------------------------ | ---------------- |
| Basic account identity | `instagram_business_basic` | Advanced for non-owned accounts | Yes (typical) | **UNKNOWN** — App Dashboard | Production approval record |
| DM text/image | `instagram_business_manage_messages` | Advanced | Yes | **UNKNOWN** | Separate from `instagram_manage_messages` (Facebook Login path) |
| Comments / private reply | `instagram_business_manage_comments` | Advanced | Yes | **UNKNOWN** | Current path uses Page token + Messenger private reply |
| Source Post / media read | `instagram_business_basic` (+ media fields TBD) | Advanced | Likely | **UNKNOWN** | Exact media field permissions on `graph.instagram.com` |
| Profile lookup (customer) | `instagram_business_basic` | Advanced | Likely | **UNKNOWN** — prior `profile_pic` review on Page path | IGSID profile endpoint on Instagram Login |
| Webhooks (messages, comments) | `instagram_business_basic` + field-specific per [Webhooks doc](https://developers.facebook.com/docs/instagram-platform/webhooks) | Advanced for `comments`, `live_comments` | Yes | **UNKNOWN** | Live mode + subscription config |
| Token refresh | `instagram_business_basic` (required for refresh) | — | Part of login scopes | N/A | — |

### Facebook Login permissions (current path — do not assume transfer)

| Permission | Used for |
| ---------- | -------- |
| `instagram_manage_messages` | Messenger Platform IG DM ([Send Message doc](https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message)) |
| Page `MESSAGE` task | Page access token eligibility |
| Page-linked `instagram_business_account` | Health probe (`verifyInstagramChannelHealth`) |

### Permissions not required for HubChat current scope

- `instagram_business_content_publish` — publishing not in runtime consumers
- Instagram Basic Display / legacy `instagram_basic` — deprecated path per Meta scope migration notice (Jan 2025)

### Business Asset User Profile Access

Prior HubChat App Review for `profile_pic` on **Facebook Graph Page-token path** does **not** automatically grant **Instagram Login** `instagram_business_*` scopes. Treat as **new review submission**.

---

## P0 / P1 architecture concerns

### P0 concerns

**None introduced by this architecture** — consistent with IG-AUTH-0 baseline (P0 = 0). Shared webhook app secret remains P1 architecture alignment, not tenant bypass.

### P1 concerns (addressed by this architecture)

| IG-AUTH-0 ID | Concern | IG-AUTH-1A response |
| ------------ | ------- | ------------------- |
| P1-1 | Platform webhook secret alignment | ADR-9 — unchanged app-level model; document secret-source consistency |
| P1-2 | Missing IG `channel_connection_id` | ADR-2 — mandatory on queue + resolver |
| P1-3 | No Instagram OAuth | ADR-1, ADR-4 — Business Login primary |
| P1-4 | Test ≠ runtime | ADR-7 — unified resolver |
| P1-5 | ENV fallback masks DB gaps | ADR-6 — `blockLegacyFallback` for OAuth connections |
| P1-6 | No OAuth fail-closed | ADR-6 — Instagram `blockLegacyFallback` equivalent |
| P1-7 | Worker Source Post Graph gap | ADR-8 Phase 7 — worker enrichment with IG Login token |
| P1-8 | Webhook secret order per route | ADR-9 — compatibility period + operator alignment |

---

## Unknowns (missing evidence)

| # | Unknown | Why it remains |
| - | ------- | -------------- |
| 1 | Production Meta App Review status for `instagram_business_manage_messages` | App Dashboard only |
| 2 | HubChat Meta app Instagram Login product configuration | App Dashboard |
| 3 | Customer IGSID profile endpoint on `graph.instagram.com` | Meta reference not confirmed in this architecture phase |
| 4 | Source Post media field parity on Instagram Login Graph | Field list validation needed in implementation |
| 5 | Instagram Login invalid-token error code catalog for terminal classification | Provider capture in Phase 2 staging |
| 6 | PKCE support for Business Login | **Not documented** in authorize parameters (2026-06-18) |
| 7 | Production `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` state | Runtime flag (IG-AUTH-0 unknown) |
| 8 | Multi-IG per tenant business requirement | Product/operator input |

---

## Official Meta sources checked (2026-06-18)

| Topic | URL |
| ----- | --- |
| Business Login for Instagram | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login |
| Get Started (Instagram Login) | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started |
| Instagram API with Facebook Login | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login |
| Instagram Login Messaging API | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ |
| Instagram Login Private Replies | https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies |
| Messenger Platform Send Message (current) | https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message |
| Instagram Platform Webhooks | https://developers.facebook.com/docs/instagram-platform/webhooks |

---

## Scope confirmation

```text
Docs/architecture only.
No runtime implementation.
No schema migration.
No OAuth routes.
No worker/resolver behavior change.
No environment or production credential change.
No deployment.
No merge performed.
```

## Verification (run at commit)

```bash
git diff --check
git diff --name-only origin/master...HEAD
git diff origin/master...HEAD | rg -n "Bearer |access_token=|APP_SECRET|VERIFY_TOKEN|EA[A-Za-z0-9]{20,}|IGA[A-Za-z0-9]{20,}"
```

Expected: docs-only diff; secret scan passes with sanitized placeholders only.
