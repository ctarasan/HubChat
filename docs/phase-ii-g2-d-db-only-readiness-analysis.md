# Phase II-G2-D — DB_ONLY Readiness Analysis

**Status:** Analysis / planning only — **do not enable `DB_ONLY` in production.**

**Date:** 2026-05-19  
**Agent:** A  
**Branch:** `docs/phase-ii-g2-d-db-only-readiness-analysis`

---

## Executive summary

SmartKorp HubChat outbound for **LINE**, **Facebook**, and **Instagram** is in production at **`DB_WITH_ENV_FALLBACK`** with operator smoke **PASS**. Code supports **`DB_ONLY`** per channel via worker env mode switches, but **`DB_ONLY` removes env credential fallback** — misconfigured or stale DB rows will fail outbound immediately.

**Recommendation (conservative):** **Option C — keep monitoring `DB_WITH_ENV_FALLBACK` longer** before any `DB_ONLY` trial. When approved, trial **LINE first**, then Facebook, then Instagram, with rollback env retained for a cooling period. **Inbound webhooks stay env-based** until a separate inbound runtime phase.

---

## 1. Runtime mode matrix

Worker reads modes from Railway (worker process only):

| Env var | Purpose |
|---------|---------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | LINE outbound resolver mode |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Facebook outbound resolver mode |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | Instagram outbound resolver mode |

Parsed values: `ENV_ONLY` (default), `DB_WITH_ENV_FALLBACK`, `DB_ONLY` (see `parse*RuntimeConfigMode` in each `*OutboundRuntimeConfig.ts`).

| Channel | Current mode (prod) | ENV_ONLY | DB_WITH_ENV_FALLBACK | DB_ONLY | Rollout status | DB_ONLY readiness |
|---------|-------------------|----------|----------------------|---------|----------------|-------------------|
| **LINE** | `DB_WITH_ENV_FALLBACK` | Yes — registry adapter from env only | Yes — DB first, env fallback with `fallbackReason` | Yes — DB only; throws if DB runtime missing | **PASS** (foundation #57) | **Conditional** — ready for controlled trial after checklist + worker smoke |
| **Facebook** | `DB_WITH_ENV_FALLBACK` | Yes | Yes — DB page token + env graph version | Yes — DB token required; graph version still from env | **PASS** (#61) | **Conditional** — after LINE trial + Meta page ID alignment verified |
| **Instagram** | `DB_WITH_ENV_FALLBACK` | Yes | Yes — DB token + page ID; env token/page fallback | Yes — DB token + `providerPageId` required; `INSTAGRAM_ACCOUNT_ID` still optional from env | **PASS** (#62, C3-R) | **Not yet** — highest mismatch risk (Page ID / token source); trial last |

### Code path summary (inspected)

| Component | Behavior |
|-----------|----------|
| `src/worker/main.ts` | Parses mode env vars; builds `*OutboundAdapterResolver` when mode ≠ `ENV_ONLY`; still registers env adapters in `channelAdapterRegistry` when env tokens present |
| `src/application/*/create*OutboundAdapterResolver.ts` | Per-send: `resolve*OutboundConfig` → tenant-scoped adapter |
| `src/lib/*OutboundRuntimeConfig.ts` | Mode logic: ENV_ONLY / DB_ONLY / DB_WITH_ENV_FALLBACK |
| `src/application/usecases/sendOutboundMessage.ts` | Uses resolver when set; else registry (env) |
| `getRuntimeConfig` → `resolveChannelRuntimeConfig` | Returns `null` if disabled, not configured, or **`status === ERROR`** |

**Important:** Test Connection uses `resolveChannelRuntimeConfigForHealthCheck`, which **ignores stored `lastError` / ERROR status** when secrets are complete. **Test connection PASS does not guarantee worker `getRuntimeConfig` succeeds** if the row is in ERROR state.

---

## 2. Env dependency matrix

**No values below — names and purpose only.**

### Outbound runtime mode (worker)

| Env var | Used by outbound? | Used by inbound? | Remove before DB_ONLY? | Remove after DB_ONLY (per channel)? | Notes |
|---------|-------------------|------------------|------------------------|-------------------------------------|-------|
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | Yes (worker) | No | No | No | Set to `DB_ONLY` only during approved LINE trial |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Yes (worker) | No | No | No | Per-channel cutover |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | Yes (worker) | No | No | No | Per-channel cutover |
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes (fallback / ENV_ONLY / registry) | Yes (inbound media on worker) | **No** | LINE outbound: after cooling **only if** inbound still needs it | Inbound worker `InboundMediaService` uses LINE token |
| `LINE_CHANNEL_SECRET` | Yes (LINE credentials in env resolver) | Yes (webhook signature) | **No** | **No** — inbound | Required for LINE webhook verification |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Yes | Yes (FB/IG webhook handlers) | **No** | FB outbound: after cooling; **keep for IG inbound** | Instagram env resolver prefers this over `INSTAGRAM_ACCESS_TOKEN` |
| `FACEBOOK_PAGE_ID` | Yes (FB/IG env paths) | Partial | **No** | FB/IG outbound: after cooling if DB `providerPageId` trusted | DB Instagram path requires `providerPageId` |
| `META_GRAPH_VERSION` | Yes (FB/IG graph version) | Yes (webhooks) | **No** | **No** — not in DB today | Always read from env in `*OutboundRuntimeConfig` |
| `FACEBOOK_GRAPH_VERSION` | Yes (alias) | Yes | **No** | **No** | Same as above |
| `INSTAGRAM_ACCESS_TOKEN` | Yes (fallback) | Yes (IG webhook) | **No** | After IG DB_ONLY + cooling | Secondary token source |
| `INSTAGRAM_PAGE_ID` | Yes (env fallback) | No | **No** | After IG DB_ONLY + cooling | Fallback if `FACEBOOK_PAGE_ID` unset |
| `INSTAGRAM_ACCOUNT_ID` | Yes (optional metadata in IG resolver) | No | **No** | Optional later | Still read from env in **all** Instagram modes |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Worker schema only | IG webhook schema | **No** | TBD | Not used in `instagramOutboundRuntimeConfig.ts` today |

### Inbound / API (must remain until separate inbound phase)

| Env var | Used by outbound? | Used by inbound? | Remove before DB_ONLY? | Remove after DB_ONLY? | Notes |
|---------|-------------------|------------------|------------------------|----------------------|-------|
| `FACEBOOK_VERIFY_TOKEN` | No | Yes | **No** | **No** | Webhook subscription verify |
| `INSTAGRAM_VERIFY_TOKEN` | No | Yes | **No** | **No** | Or fallback to `FACEBOOK_VERIFY_TOKEN` |
| `DEFAULT_TENANT_ID` | No | Yes (webhook routing) | **No** | **No** | Single-tenant routing |

### Code paths still using env fallback (when mode = `DB_WITH_ENV_FALLBACK`)

| Channel | Falls back to env when |
|---------|------------------------|
| LINE | `getRuntimeConfig` null; disabled; not configured; **ERROR** status; incomplete secrets |
| Facebook | Same |
| Instagram | Same |

When mode = **`DB_ONLY`**: **no env credential fallback** — missing DB runtime → safe error (`*OutboundRuntimeConfigError`), no secret echo in messages.

When mode = **`ENV_ONLY`**: worker does not install resolver; `SendOutboundMessageUseCase` uses **registry** adapters built at startup from env.

---

## 3. Channel Settings readiness

Table: `channel_settings` (per tenant). API: `/dashboard/channel-settings`, `POST .../test-connection`.

### LINE

| Requirement | Safe check |
|-------------|------------|
| Row exists | Yes / no |
| `enabled` | Must be true |
| Secrets | `accessToken` + `channelSecret` configured (not configured = missing) |
| `providerPageId` | Optional for LINE outbound (health check may populate from bot info) |
| Test connection | **READY** (`status` READY, `ok: true`) before DB_ONLY |
| Worker path | `getRuntimeConfig` must be non-null (**not ERROR**) |
| Recent smoke | Outbound queue message **PASS** with log `runtimeSource: db` |

### Facebook

| Requirement | Safe check |
|-------------|------------|
| Row exists | Yes / no |
| `enabled` | true |
| Secrets | `page_access_token` configured |
| `providerPageId` | **Recommended** — aligns with Messenger Page ID |
| `appSecret` / `verifyToken` | In DB for admin; **inbound verify still uses env** today |
| Test connection | **READY** before DB_ONLY |
| Worker smoke | Messenger DM send **PASS**, `runtimeSource: db` |
| Graph version | Still from worker env (`META_GRAPH_VERSION` / `FACEBOOK_GRAPH_VERSION`) |

### Instagram

| Requirement | Safe check |
|-------------|------------|
| Row exists | Yes / no |
| `enabled` | true |
| Secrets | `access_token` configured (Page token) |
| `providerPageId` | **Required** for DB credentials (`pageId` in resolver) |
| Test connection | **READY** before DB_ONLY |
| Worker smoke | Instagram DM send **PASS** — **required** (stricter than test-connection alone) |
| Token source | DB token must match Page linked to IG Business account |
| `INSTAGRAM_ACCOUNT_ID` | Optional env; still used when set |

---

## 4. DB_ONLY prerequisites (checklist)

Per channel, all must be true before setting `HUBCHAT_*_RUNTIME_CONFIG_MODE=DB_ONLY`:

- [ ] `channel_settings` row exists for tenant
- [ ] Channel **enabled**
- [ ] Required secrets **configured** (present/missing only in reports)
- [ ] Provider metadata set where required (FB/IG Page ID)
- [ ] **Test connection** result **READY** (and `lastVerifiedAt` recent)
- [ ] **`getRuntimeConfig` path verified** — row not in **ERROR** state for worker sends
- [ ] **Recent outbound worker smoke PASS** (not API-only test)
- [ ] Worker logs **clean** — no new loop failures; **no secret leak** in logs
- [ ] **Rollback env vars** still present on Railway (same values, not printed)
- [ ] **`DB_WITH_ENV_FALLBACK` monitoring** period complete (recommend ≥ 1–2 weeks stable)
- [ ] **Human operator** approves DB_ONLY trial for that channel
- [ ] **ChatGPT** approves phase scope (this document is analysis only)

---

## 5. DB_ONLY rollout plan

### Stage 1 — Monitor (current)

- Keep **all channels** at `DB_WITH_ENV_FALLBACK`
- Watch worker logs for `fallbackReason` (disabled / not_configured / error_state)
- Track outbound failure rate per channel
- Confirm Channel Settings edits propagate to worker on next send

### Stage 2 — Single-channel DB_ONLY trial

**Recommended order:**

1. **LINE** — fewest external IDs; clearest DB secret pair; mature tests
2. **Facebook** — depends on Page ID + graph version env remaining
3. **Instagram** — highest risk (Page token, Page ID, IG linkage)

**Alternative order:** Only if LINE shows DB instability — **do not** skip worker smoke between channels.

**Procedure (per channel):**

1. Pre-rollout snapshot (env keys **present/missing**, mode names only)
2. Pre-rollout outbound smoke at `DB_WITH_ENV_FALLBACK`
3. Set **only** `HUBCHAT_<CHANNEL>_RUNTIME_CONFIG_MODE=DB_ONLY` on **worker**
4. Redeploy / restart worker
5. Confirm startup log shows correct mode (no token values logged)
6. Stage 3 smoke

### Stage 3 — Per-channel DB_ONLY smoke

| Check | Pass criteria |
|-------|----------------|
| Worker startup | Mode logged; no boot failure |
| Outbound send | Message **SENT** / queue **DONE** |
| Runtime source | Structured log shows `runtimeSource: db` (no fallback) |
| Channel Settings | Still **READY** on test-connection |
| Negative test | Disable channel in DB → outbound fails safe (no secrets in error) |
| Rollback drill | Revert mode to `DB_WITH_ENV_FALLBACK` → smoke PASS |

### Stage 4 — Cooling period

- Keep **env outbound credentials** on Railway **unchanged** for **≥ 7–14 days** after DB_ONLY PASS
- Do not remove env vars until rollback is proven and monitoring is quiet

### Stage 5 — Env cleanup (later, separate approval)

- Remove **outbound-only** env vars for channels at **DB_ONLY** on all tenants
- **Never** remove inbound webhook verify tokens / LINE channel secret in this phase

---

## 6. Rollback plan

Per channel (operator + docs report):

| Step | Action |
|------|--------|
| 1 | Set `HUBCHAT_<CHANNEL>_RUNTIME_CONFIG_MODE` → `DB_WITH_ENV_FALLBACK` (or `ENV_ONLY` if emergency) |
| 2 | Redeploy / restart **worker** |
| 3 | Verify startup mode log |
| 4 | Outbound smoke (same tenant / conversation type as pre-rollout) |
| 5 | Confirm worker logs clean |
| 6 | Update `LATEST.md` + agent report with PASS/FAIL |

**Emergency `ENV_ONLY`:** Removes per-tenant DB resolver; uses startup registry adapters only — requires env tokens **present**.

---

## 7. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| DB row missing / disabled | High | Checklist + smoke; stay on DB_WITH_ENV_FALLBACK |
| Expired token in DB | High | Test connection + periodic re-verify; monitor ERROR status |
| Page token / `providerPageId` mismatch (FB/IG) | High | Align IDs in Channel Settings; worker DM smoke |
| Test connection PASS but worker ERROR status | Medium | Treat test-connection as necessary not sufficient; check `status` field |
| `getRuntimeConfig` null while health check passes | Medium | Clear `lastError`; re-run test-connection after fix |
| Inbound still env-based | Low (expected) | Do not remove webhook env vars in G2-D |
| Removing env too early | High | Cooling period; rollback rehearsal |
| Provider rate limits / permissions | Medium | Smoke after cutover; watch Graph error codes (sanitized) |
| Graph version only in env | Low | Keep `META_GRAPH_VERSION` on worker through DB_ONLY |
| Instagram `INSTAGRAM_ACCOUNT_ID` env-only | Low | Document; optional future DB field |
| No structured fallback metrics | Medium | **Option B** — add observability before DB_ONLY (future phase) |

---

## 8. Code changes before DB_ONLY?

| Area | Required for DB_ONLY? | Notes |
|------|----------------------|-------|
| Runtime config modules | **No** | Modes implemented + tested |
| Adapter resolvers | **No** | Wired in worker |
| Channel Settings API | **No** | Storage + test-connection exist |
| Migrations | **No** | Not in scope |
| Observability | **Recommended later** | Dashboard for `runtimeSource` / `fallbackReason` counts |
| Graph version in DB | **Optional later** | Today env-only |
| Inbound runtime config | **Separate phase** | Do not mix with outbound DB_ONLY |

**Conclusion:** No application code changes **required** for readiness; optional observability improvements first (Option B).

---

## 9. Inbound webhook runtime

**Recommendation:** Treat **inbound webhook runtime config** as a **later separate phase** (Phase II-G2-E or similar).

Reasons:

- LINE webhook verification uses **`LINE_CHANNEL_SECRET`** (env)
- Facebook uses **`FACEBOOK_VERIFY_TOKEN`** (env)
- Instagram verify uses **`INSTAGRAM_VERIFY_TOKEN`** or **`FACEBOOK_VERIFY_TOKEN`**
- Webhook POST handlers use env tokens for Graph fetch / routing
- Outbound DB_ONLY does **not** migrate inbound credentials

---

## 10. Recommended next action

| Option | Recommendation |
|--------|----------------|
| **A. Proceed to DB_ONLY for one channel** | **Not now** — wait for monitoring window |
| **B. Add observability first** | **Nice-to-have** — log aggregation for `runtimeSource` / `fallbackReason` |
| **C. Keep monitoring DB_WITH_ENV_FALLBACK longer** | **Yes — primary recommendation** |

**After ChatGPT approval of a dedicated rollout phase:**

1. Run full checklist for **LINE**
2. Trial **LINE** `DB_ONLY` with operator on-call and rollback env ready
3. Only then plan Facebook, then Instagram

---

## Appendix — Files inspected

| File | Finding |
|------|---------|
| `src/lib/lineOutboundRuntimeConfig.ts` | Full trio of modes; DB_ONLY strict |
| `src/lib/facebookOutboundRuntimeConfig.ts` | Graph version from env always |
| `src/lib/instagramOutboundRuntimeConfig.ts` | Page ID from DB; optional `INSTAGRAM_ACCOUNT_ID` from env |
| `src/application/lineOutbound/createLineOutboundAdapterResolver.ts` | Logs `runtimeSource`, `fallbackReason` |
| `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` | Same pattern |
| `src/application/instagramOutbound/createInstagramOutboundAdapterResolver.ts` | Same pattern |
| `src/application/usecases/sendOutboundMessage.ts` | Resolver vs registry selection |
| `src/worker/main.ts` | Mode env vars; dual registry + resolvers |
| `src/lib/channelSettingPublicDto.ts` | ERROR blocks runtime; health check variant |
| `src/application/usecases/testChannelConnection.ts` | Uses health-check resolver |
| `src/infrastructure/adapters/repositories/supabaseChannelSettingRepository.ts` | `getRuntimeConfig` / test paths |

---

## Guardrails (this task)

- Analysis / documentation only
- **Do not enable `DB_ONLY`**
- **No production env changes**
- **No application code changes**
- **No secrets or raw env values in this document**
