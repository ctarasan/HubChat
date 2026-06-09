# CCW-0 — Channel Connection Data Scope Audit

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-08 |
| Phase | CCW-0 (analysis / audit only) |
| Status | Complete — no product or runtime behavior change |
| Base commit | `d1389bb` (master) |
| Marketplace / CDP | Out of scope |
| Profile image enrichment | Out of scope |

## Executive summary

HubChat listing and analytics APIs scope data by **tenant + role/assignment (+ optional `channel_type`)** only. They do **not** filter by active Facebook Page ID, LINE bot/channel ID, or Instagram Business Account ID.

After switching to a new Facebook Page or LINE account, **old test conversations and leads remain visible** because:

1. Historical rows stay in `conversations` / `leads` for the same `tenant_id`.
2. No list API joins or filters against `channel_settings`, `channel_connections`, or active provider account IDs.
3. `filterOwnPlatformAccountConversations` hides operator-owned Instagram/Facebook identities from env — it is **not** a channel-connection scope filter.
4. `channel_connections` exists (CCP-1) but is **not linked** to conversations, leads, or messages.
5. `channel_settings` is **one row per `(tenant_id, channel)`** and overwrites on reconnect; it does not version historical connections.

**Root cause of operator symptom:** tenant-wide inbox, not missing inbound routing alone.

---

## Files inspected

### API routes

| Path | Role |
|---|---|
| `app/api/conversations/route.ts` | Inbox list |
| `app/api/leads/route.ts` | Leads menu list |
| `app/api/workflow/items/route.ts` | Follow-up work queue |
| `app/api/workflow/summary/route.ts` | Work queue summary (same repo patterns) |
| `app/api/analytics/overview/route.ts` | Manager analytics |
| `app/api/dashboard/metrics/route.ts` | Legacy dashboard metrics |
| `app/api/marketing-events/route.ts` | Marketing timeline |
| `app/api/channel-settings/route.ts` | Connection config (admin; not used by list APIs) |

### Application / repositories

| Path | Role |
|---|---|
| `src/infrastructure/adapters/repositories/supabaseConversationRepository.ts` | `list`, `listForLeadsMenu` |
| `src/application/usecases/listLeadsForMenu.ts` | Leads list use case |
| `src/application/usecases/listWorkflowItems.ts` | Workflow list |
| `src/infrastructure/adapters/repositories/supabaseWorkflowRepository.ts` | Workflow queries |
| `src/application/usecases/getAnalyticsOverview.ts` | Analytics use case |
| `src/infrastructure/adapters/repositories/supabaseAnalyticsOverviewRepository.ts` | Analytics counts |
| `src/application/usecases/listMarketingEvents.ts` | Marketing events |
| `src/infrastructure/adapters/repositories/supabaseMarketingEventRepository.ts` | Marketing event list |
| `src/interfaces/api/conversationSelfFilter.ts` | Post-query self-identity filter |
| `src/interfaces/api/conversationListScope.ts` | Role/assignment scope |
| `src/application/usecases/processInboundMessage.ts` | Inbound persistence |
| `src/infrastructure/adapters/repositories/supabaseChannelAccountRepository.ts` | Legacy channel account lookup |
| `src/infrastructure/adapters/repositories/supabaseChannelConnectionRepository.ts` | CCP-1 connections |
| `src/domain/channelConnections.ts` | Connection domain types |
| `src/lib/*OutboundRuntimeConfig.ts` | Outbound credential resolution |
| `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` | Optional CCP outbound path |

### Inbound adapters / webhooks

| Path | Role |
|---|---|
| `src/interfaces/api/webhook/line.ts` | LINE inbound |
| `src/interfaces/api/webhook/facebook.ts` | Facebook inbound |
| `src/interfaces/api/webhook/instagram.ts` | Instagram inbound |
| `src/infrastructure/adapters/channels/facebookAdapter.ts` | FB normalize + `sourceThreadType` |
| `src/infrastructure/adapters/channels/instagramAdapter.ts` | IG normalize + `sourceThreadType` |

### Schema

| Path | Role |
|---|---|
| `supabase/schema.sql` | Canonical schema mirror |
| `supabase/migrations/20260520120000_phase_ii_g1_a_channel_settings.sql` | `channel_settings` |
| `supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql` | `channel_connections` |

### Prior related audits

| Path | Role |
|---|---|
| `docs/agent-reports/agent-a/2026-06-04-ccp-0-channel-connect-platform-audit-and-architecture.md` | CCP credential/runtime split |
| `docs/agent-reports/agent-a/2026-06-06-prod-cutover-1a-facebook-page-readiness.md` | FB page/token mismatch notes |

---

## APIs inspected — scope matrix

| API | Auth scope | Data filters today | Provider connection scope |
|---|---|---|---|
| `GET /api/conversations` | Tenant + SALES/MANAGER/ADMIN; assignment scope (`mine` / `team` / `all`) | `tenant_id`, optional `status`, `channel_type`, assignment, inbox urgency filters | **None** — optional `provider_page_id` in SELECT but not filtered |
| `GET /api/leads` | Same via `listLeadsForMenu` | `tenant_id`, `lead_id not null`, optional `channel_type`, lead status, assignment, search | **None** |
| `GET /api/workflow/items` | Tenant + role scope | `tenant_id`, follow-up status, optional `channel_type`, assignment | **None** |
| `GET /api/analytics/overview` | Tenant + MANAGER/ADMIN | `tenant_id`, date range | **None** — aggregates all tenant conversations/leads/messages |
| `GET /api/dashboard/metrics` | Tenant + MANAGER/ADMIN | `tenant_id`, 30-day message window | **None** |
| `GET /api/marketing-events` | Tenant + role; SALES needs lead/conversation id | `tenant_id`, optional lead/conversation/event type | **None** |
| `GET /api/channel-settings` | Admin channel config | Per-tenant settings rows | **Defines** active config; not consumed by list APIs |

### Post-query filter note

`filterOwnPlatformAccountConversations` (`conversationSelfFilter.ts`) removes rows where the participant matches env-configured **operator own** Instagram business IDs / Facebook page ID / explicit self ID lists. It does **not**:

- Read `channel_settings` or `channel_connections`
- Hide data from a **previous** customer Page or LINE bot
- Apply to workflow or analytics endpoints

---

## Audit questions (answers)

### 1. Which APIs are filtered only by tenant/role/assignment?

**All scoped list/analytics APIs above** filter primarily by `tenant_id` plus role/assignment (and optional `channel_type`, status, inbox filters). None apply active-connection identity filters.

### 2. Which APIs already include provider account/channel scope?

| Area | Partial provider identity | Active-connection filter |
|---|---|---|
| Conversation list DTO | Exposes `provider_page_id` (read-only field) | No |
| Facebook DM/comment repository lookups | `findFacebookMessengerDmByParticipant` filters `provider_page_id` | Internal routing only; not list APIs |
| Inbound persistence | Writes `provider_page_id` on create | N/A |
| `channel_settings` / `channel_connections` APIs | Store `providerPageId`, `providerAccountId`, `providerIgAccountId` | Not joined to inbox |
| Outbound worker resolvers | Resolve token for **current** configured page/bot | Does not affect listing |

**Conclusion:** Provider identity is **stored and exposed** in places, but **listing APIs do not filter** by it.

### 3. Which tables/fields store provider identity?

| Provider | Identity field | Where stored | Notes |
|---|---|---|---|
| **Facebook Page** | Page ID | `conversations.provider_page_id` | Set from inbound `facebookPageId` |
| | Page ID | `channel_settings.config_json.providerPageId` | Current admin config |
| | Page ID | `channel_connections.provider_page_id` | CCP-1; `unique(tenant_id, provider)` |
| | Page ID | ENV `FACEBOOK_PAGE_ID` | Runtime fallback |
| **LINE** | Bot basic ID / channel ID | `channel_settings.config_json` (`channelId`, `providerAccountId` patterns in tests/UI) | Not on `conversations` |
| | Bot ID | `channel_connections.provider_account_id` | CCP-1 |
| | Bot ID | `channel_accounts.external_account_id` | Legacy; first row per tenant+channel |
| | Secret | `channel_settings.secret_json.channel_secret`, ENV `LINE_CHANNEL_SECRET` | Verification only |
| **Instagram** | IG Business Account ID | `channel_connections.provider_ig_account_id` | CCP-1 |
| | Page / IG ID | `channel_settings.config_json.providerPageId` | Often IG user id |
| | Page ID on conversation | `conversations.provider_page_id` | From inbound `instagramPageId` |

**Not found:** `provider_media_id` column anywhere in schema or code.

**Related conversation fields:** `provider_thread_type`, `provider_comment_id`, `provider_post_id`, `private_reply_sent_at`, `private_reply_comment_id`, `channel_thread_id`.

### 4. Can conversations/leads/contact_identities backfill provider connection identity?

| Entity | Backfill potential | Gaps |
|---|---|---|
| **conversations** | **Good for FB/IG** when `provider_page_id` populated | LINE rows lack provider account id; old FB rows may have null or old page id; no `connection_id` |
| **leads** | **Poor** — only `source_channel` + `external_user_id` | No page/bot id; same PSID across pages possible |
| **messages** | **Poor** — `channel_type` + `conversation_id` only | No provider account column |
| **contact_identities** | **Poor** — `(tenant, channel_type, external_user_id)` unique | No provider account scope |

**Backfill heuristic (future):** Match `conversations.provider_page_id` to active `channel_settings` / `channel_connections` for FB/IG. LINE requires new capture at inbound or join via `channel_account_id` if `external_account_id` is maintained.

### 5. Is LINE channel secret suitable for data scoping?

**No.** `LINE_CHANNEL_SECRET` is used for **HMAC webhook signature verification** only (`verifyLineWebhookSignature`). It is not a stable public channel identifier and must not be used for data scoping or exposed in APIs.

LINE data scoping should use **bot basic ID / channel ID** from `GET /v2/bot/info` (`channelHealthCheck.ts`), stored as `provider_account_id` / `config_json.channelId`.

### 6. Recommended schema/model for channel connection scoping

**Target model (future — not implemented in CCW-0):**

```
channel_connections (may need multi-connection per provider — see Q7)
  id, tenant_id, provider, provider_account_id, provider_page_id, provider_ig_account_id
  status (READY | REVOKED | ...), connected_at, revoked_at

conversations
  + channel_connection_id (nullable FK, indexed)
  provider_page_id / provider_account_id denormalized for query performance

leads (optional phase 2)
  + primary_channel_connection_id OR scope via latest conversation

messages
  inherit scope via conversation_id (no direct FK required)
```

**Runtime resolution:**

1. On inbound: resolve connection by webhook `public_connection_key` (CCP) or provider account id from payload → set `channel_connection_id` on create.
2. On list: default filter `channel_connection_id IN (active_connection_ids)` where active = `status IN ('READY', ...)` and not `REVOKED`.
3. Admin override query param `connectionScope=all|active|connection:<uuid>` for support/history.

### 7. Is a new `channel_connections` table recommended?

**Already exists** (`20260604120000_ccp_1_channel_connection_foundation.sql`).

**Gap:** Current constraint `unique (tenant_id, provider)` allows **only one connection per provider per tenant**. That fits single-page MVP but **cannot represent** multiple historical Pages/bots without:

- Revoking old row and losing history linkage, or
- Evolving to `unique (tenant_id, provider, provider_account_id)` + status lifecycle (recommended in CCW-1A design).

**Recommendation:** Extend existing `channel_connections`; do **not** add a parallel table.

### 8. Should conversations/leads/messages link by `channel_connection_id`?

| Table | Link recommended? | Rationale |
|---|---|---|
| **conversations** | **Yes (primary)** | Direct inbox filter; set at inbound create |
| **leads** | **Optional / derived** | Lead can span channels; scope via conversations or `primary_connection_id` later |
| **messages** | **Via conversation** | Avoid redundant FK unless analytics needs denormalization |

### 9. Migration / backfill risks

| Risk | Severity | Notes |
|---|---|---|
| Old test data visible after page switch | **Observed** | Expected with tenant-only scope |
| `provider_page_id` null on legacy rows | Medium | Heuristic backfill incomplete → may hide or mis-bucket |
| Same PSID, different pages | Medium | FB PSIDs are page-scoped but lead dedupe is by `external_user_id` only |
| LINE no page id on conversations | High for LINE | Cannot backfill LINE scope without new inbound field |
| `channel_account_id` points to first legacy account | Medium | `findByTenantAndChannel` returns oldest row |
| Overwriting `channel_settings` loses history | Medium | No versioned connections in settings table |
| Filtering too aggressively | High | Operators lose access to legit pre-switch open conversations |
| Analytics discontinuity | Low | Period comparisons change when scope filter added |

### 10. Safest default behavior

**Recommended default for operator surfaces (CCW-1B):**

- **Active connections only** for Dashboard inbox, leads menu, workflow, and analytics **snapshots**.
- **Include disconnected/test** only when:
  - Admin enables "Show historical connections", or
  - Conversation status is OPEN and updated within retention window, or
  - Explicit `connectionScope=all` (MANAGER/ADMIN).

**Rationale:** Matches operator expectation after cutover ("show me current Page/OA traffic") while preserving data for admin export and optional history mode.

---

## Inbound persistence findings

| Channel | Thread types | Provider identity captured | `channel_connection_id` |
|---|---|---|---|
| LINE DM | `channel_thread_id` = LINE user id | No bot id on conversation | No |
| Facebook DM | `MESSENGER_DM`, `user:<psid>` | `provider_page_id`, `provider_external_user_id` | No |
| Facebook Comment | `FACEBOOK_COMMENT`, `comment:*` | `provider_page_id`, `provider_comment_id`, `provider_post_id` | No |
| Instagram DM | `INSTAGRAM_DM`, `ig:user:*` | `provider_page_id` (IG id), `provider_external_user_id` | No |
| Instagram Comment | `INSTAGRAM_COMMENT`, `ig:comment:*` | `provider_page_id`, comment id in thread | No |

Inbound uses `ChannelAccountRepository.findByTenantAndChannel(tenantId, channel)` → **first** `channel_accounts` row; not tied to active Page/bot from webhook.

---

## Outbound / runtime config linkage

| Mode | Config source | Listing impact |
|---|---|---|
| `DB_WITH_ENV_FALLBACK` (production) | `channel_settings` then ENV | None on lists |
| Resolver flag off (production) | Legacy paths predominate | None |
| `channel_connections` | Used when resolver enabled for outbound | Not linked to persisted conversations |

Outbound correctly uses **current** credentials; inbox incorrectly shows **all tenant** conversations regardless of which Page/OA originated them.

---

## Out-of-scope confirmation (CCW-0)

- [x] No `DB_ONLY` enablement
- [x] No resolver flag enablement
- [x] No outbound / webhook behavior change
- [x] No profile image / display name enrichment changes
- [x] No Marketplace / CDP changes
- [x] No migrations added
- [x] No secrets, tokens, PSIDs, or raw payloads in this document

---

## Proposed next phases

### CCW-1A — Data model & backfill design (docs + migration draft)

1. Evolve `channel_connections` to support **multiple accounts per provider** with `REVOKED` lifecycle.
2. Add `conversations.channel_connection_id` (nullable FK + index).
3. Define backfill rules:
   - FB/IG: match `provider_page_id` → connection row
   - LINE: mark unknown until inbound sets connection on new messages
4. Document admin "historical scope" policy.

### CCW-1B — API scope implementation

1. Resolve **active connection IDs** per tenant from `channel_connections` (+ fallback `channel_settings` during transition).
2. Add repository filters to:
   - `GET /api/conversations`
   - `GET /api/leads`
   - `GET /api/workflow/items`
   - `GET /api/analytics/overview`
3. Optional query override `connectionScope` for MANAGER/ADMIN.
4. Add regression tests: old page data excluded when new connection READY.

---

## Verification performed (CCW-0)

| Check | Result |
|---|---|
| Code path read-only audit | Complete |
| Schema / migration review | Complete |
| No runtime code changes | Confirmed |
| `git diff --check` on report only | PASS (at commit) |

---

## Verdict

**PASS — audit complete.** HubChat list/analytics APIs are **tenant-scoped, not connection-scoped**. The reported symptom after Facebook Page / LINE account switch is **consistent with current architecture**. `channel_connections` foundation exists but is **not wired to conversation persistence or listing**. CCW-1A/1B should add `channel_connection_id` linkage and active-connection default filters.
