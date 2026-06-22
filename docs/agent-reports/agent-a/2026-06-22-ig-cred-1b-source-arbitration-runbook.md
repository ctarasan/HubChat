# IG-CRED-1B — Legacy Instagram Source Arbitration and Recovery Runbook

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-22 |
| Phase | IG-CRED-1B (read-only investigation + docs-only planning) |
| Base commit (post PR #276) | `6fd5ff5a402037f8a8f05f7e71f8c381c57be61b` |
| Prior evidence | `docs/agent-reports/agent-a/2026-06-22-ig-cred-1a-read-only-preflight.md` (merged via PR #276) |
| Credential write / reconnect | **NOT AUTHORIZED** |

## Executive summary

Production Instagram is on the **legacy `channel_settings` path** (no `channel_connections` / `instagram_oauth_credentials`). The **database page access token is expired** (`OAuthException code=190`, expiry **2026-06-16**). Under worker mode **`DB_WITH_ENV_FALLBACK`**, outbound resolves to **Railway environment credentials** when DB runtime is blocked by `ERROR` status — but Railway ENV points to a **different Facebook Page** (`1137…len=16`) than the DB canonical page (`5418…len=15`) and Railway ENV token is also **expired (`code=190`)**.

**Stop condition triggered:** `HOLD — ENV CREDENTIAL IDENTITY MISMATCH`

**Recommended next gate:** `HOLD — ENV SOURCE OR IDENTITY UNRESOLVED` — resolve Railway/Vercel ENV page alignment (or document ENV as non-authoritative) before authorizing `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`.

---

## Phase 0 — PR #276 merge

| Gate | Result |
| --- | --- |
| `state` | OPEN → **MERGED** |
| `headRefOid` | `a6e588753d5cfeacd1a8673f98445bcf0f64a5ad` ✓ |
| `baseRefName` | `master` ✓ |
| Checks | **SUCCESS** (Vercel) ✓ |
| `mergeable` | MERGEABLE ✓ |

| Field | Value |
| --- | --- |
| Merge commit | `6fd5ff5a402037f8a8f05f7e71f8c381c57be61b` |
| Merge timestamp (UTC) | `2026-06-22T09:27:25Z` |
| Latest `master` | `6fd5ff5a402037f8a8f05f7e71f8c381c57be61b` |

---

## Phase 1 — Repository baseline

| Check | Result |
| --- | --- |
| `HEAD` | `6fd5ff5a402037f8a8f05f7e71f8c381c57be61b` |
| IG-CRED-1A evidence on master | **YES** |
| Tracked working tree | **clean** |
| Agent B synced master | **not verified in this session** |

---

## Phase 2 — Resolver behavior reconstruction

### UI / Test Connection path

| Step | Implementation |
| --- | --- |
| Entry | `app/api/channel-settings/[channel]/test-connection/route.ts` → `TestChannelConnectionUseCase.execute` |
| OAuth branch guard | `tryOAuthManagedInstagramRuntime` — **skipped** (no OAuth rows) |
| Legacy runtime load | `channelSettingRepository.getRuntimeConfigForConnectionTest` |
| DTO helper | `resolveChannelRuntimeConfigForHealthCheck` (`src/lib/channelSettingPublicDto.ts`) |
| Meta probe | `verifyInstagramChannelHealth` (`src/infrastructure/adapters/channels/channelHealthCheck.ts`) |
| Persistence | `updateConnectionHealth` (`supabaseChannelSettingRepository.ts`) on success/failure |

**Confirmed behaviors:**

| Question | Answer |
| --- | --- |
| Loads DB secret when persisted status is ERROR? | **YES** — `resolveChannelRuntimeConfigForHealthCheck` ignores `lastError`; only requires `configured` + complete secrets |
| Meta call read-only at provider? | **YES** — Graph GET only |
| Persists `lastError` / status / timestamps? | **YES** — `verifyAndPersist` → `updateConnectionHealth` writes `config_json.lastError` or `lastVerifiedAt` + clears error on success; public `status` becomes `ERROR` when `lastError` present |
| Identity in response | Page ID from runtime; Instagram account name/username via `instagram_business_account` when probe succeeds |
| Wrong-account guard | **NO** dedicated guard on legacy path (OAuth path has identity checks) |

**Classification:** Test Connection = **`CONTROLLED STATUS WRITE`** (not safe for IG-CRED-1B preflight probes).

### Worker outbound path (Railway)

| Step | Implementation |
| --- | --- |
| Entry | `createInstagramOutboundAdapterResolver` → `resolveInstagramWorkerOutboundConfig` |
| Channel Connect attempt | `tryResolveInstagramFromChannelConnect` when resolver enabled + mode allows DB |
| Legacy resolver | `resolveInstagramOutboundConfig` (`src/lib/instagramOutboundRuntimeConfig.ts`) |
| DB load | `channelSettingRepository.getRuntimeConfig` → `resolveChannelRuntimeConfig` |

**Precedence (`resolveInstagramOutboundConfig`, mode `DB_WITH_ENV_FALLBACK`):**

| # | Condition | Selected source |
| --- | --- | --- |
| 1 | DB runtime available (enabled, configured, **status not ERROR**, secrets complete) | **DB** (`source: "db"`) |
| 2 | DB runtime `null` because **ERROR** state (`resolveChannelRuntimeConfig` returns null when `lastError`) | **ENV fallback** if env credentials present |
| 3 | DB secret absent / not configured | **ENV fallback** |
| 4 | Neither DB nor ENV | **missing config** (throws) |
| 5 | Provider rejects token at send time | Delivery failure (worker/outbound error path); **no automatic source switch** |

**Answers:**

| Question | Answer |
| --- | --- |
| DB token selected when status READY? | **YES** |
| DB token selected when status ERROR? | **NO** — `getRuntimeConfig` returns null |
| ENV fallback when status ERROR? | **YES** (when mode is `DB_WITH_ENV_FALLBACK`) |
| ENV fallback when DB secret absent? | **YES** |
| ENV fallback after provider rejection? | **NO** — same source retried/fails |

**Runtime split:**

| Runtime | Instagram outbound resolution |
| --- | --- |
| **Railway worker** | `resolveInstagramWorkerOutboundConfig` + `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` (**SET**, value not dumped) |
| **Vercel app/API** | Test Connection + channel settings PATCH; not primary outbound sender |

---

## Phase 3 — Production credential-source inventory (names only)

### Vercel production

| Variable | State |
| --- | --- |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **SET** |
| `INSTAGRAM_ACCESS_TOKEN` | **ABSENT** |
| `FACEBOOK_PAGE_ID` | **ABSENT** (not listed) |
| `INSTAGRAM_PAGE_ID` | **ABSENT** |
| `INSTAGRAM_APP_SECRET` | **SET** |
| `INSTAGRAM_VERIFY_TOKEN` | **SET** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **ABSENT** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **SET** |
| All `HUBCHAT_INSTAGRAM_OAUTH_*` delivery/connect flags | **ABSENT** |

### Railway production worker

| Variable | State |
| --- | --- |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **SET** |
| `INSTAGRAM_ACCESS_TOKEN` | **ABSENT** |
| `FACEBOOK_PAGE_ID` | **SET** |
| `INSTAGRAM_PAGE_ID` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **SET** |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **SET** |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | **SET** |
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | **SET** |
| `FACEBOOK_GRAPH_VERSION` | **SET** |
| All `HUBCHAT_INSTAGRAM_OAUTH_*` delivery flags | **ABSENT** |

### Summary

| Question | Answer |
| --- | --- |
| Vercel ENV token present | **YES** (`FACEBOOK_PAGE_ACCESS_TOKEN`) |
| Railway ENV token present | **YES** (`FACEBOOK_PAGE_ACCESS_TOKEN`) |
| Vercel/Railway variable names aligned | **PARTIAL** — both have page token; **Railway has `FACEBOOK_PAGE_ID`, Vercel does not list it** |
| Resolver mode | Worker: **`DB_WITH_ENV_FALLBACK`** (flag SET; exact value not recorded) |
| Potential runtime source divergence | **YES** — DB page `5418…len=15` vs Railway page `1137…len=16`; both tokens expired |

`SET` on both runtimes **does not prove equal values**.

---

## Phase 4 — Non-persisting health probes

### Probe A — Legacy DB credential

**Method:** Trusted recent production evidence (IG-CRED-1A UI smoke + read-only DB metadata `2026-06-22`); **not** Channel Settings Test Connection (persists state).

| Field | Result |
| --- | --- |
| Credential source | **DB** (`channel_settings.secret_json`) |
| Token accepted by Meta | **NO** |
| Error category/code | **Expired / `code=190`** |
| Facebook Page safe reference | `5418…len=15` |
| Instagram Professional Account safe reference | **not returned** (probe failed at token validation) |
| Identity relationship valid | **NO** (expired) |
| Required permissions | **not assessed** (failed before IG linkage) |

### Probe B — Vercel ENV credential

| Field | Result |
| --- | --- |
| Classification | **`UNVERIFIED — SAFE NON-PERSISTING PROBE UNAVAILABLE`** locally without pulling encrypted Vercel values; `FACEBOOK_PAGE_ID` absent from inventory |

### Probe C — Railway ENV credential

**Method:** `verifyInstagramChannelHealth` via approved local probe (`scripts/_ig-cred-1b-railway-probe.mjs`, sanitized stdout only, **not committed**).

| Field | Result |
| --- | --- |
| Credential present | **YES** |
| Token accepted | **NO** |
| Error code | **190** |
| Page safe reference | `1137…len=16` |
| Instagram Professional Account safe reference | **null** (probe failed before IG account resolved) |
| Identity relationship valid | **NO** |

---

## Phase 5 — Identity arbitration

### Expected production identity (trusted records)

| Field | Safe reference |
| --- | --- |
| Tenant | `ba82…865f` |
| Channel type | `INSTAGRAM` |
| Expected Facebook Page | `5418…len=15` (from `channel_settings.config_json.providerPageId`) |
| Expected Instagram Professional Account | **UNVERIFIED** — DB stores display metadata only; no persisted IG account ID on legacy path |

### Per-source classification

| Source | Page vs expected | IG account vs expected | Classification |
| --- | --- | --- | --- |
| **DB** (`channel_settings`) | **MATCH** (`5418…len=15`) | **UNVERIFIED** | **EXPIRED** |
| **Railway ENV** | **MISMATCH** (`1137…len=16` ≠ `5418…len=15`) | **UNVERIFIED** | **EXPIRED** |
| **Vercel ENV** | **UNVERIFIED** (no page id in inventory) | **UNVERIFIED** | **UNVERIFIED** |

**Stop condition:** `HOLD — ENV CREDENTIAL IDENTITY MISMATCH` (Railway ENV page ≠ DB canonical page).

Do **not** treat Railway ENV as a valid alternate production identity without operator realignment.

---

## Phase 6 — Canonical production source decision

### Option A — Database canonical, ENV emergency fallback

| Criterion | Assessment |
| --- | --- |
| Feasible as incident target | **YES** — matches Channel Settings UX and tenant configuration |
| Current blockers | DB token expired; Railway ENV wrong page + expired |
| ENV disposition | Must be **identity-aligned or explicitly non-authoritative** before token re-entry |

### Option B — ENV canonical temporarily

| Criterion | Assessment |
| --- | --- |
| Feasible | **NO** — Railway ENV **identity-mismatched** and **expired**; would not restore UI READY |
| Complete recovery | **NO** — Channel Settings would remain ERROR |

### Selected canonical source (planning)

```text
Database canonical credential (channel_settings) for tenant ba82…865f / page 5418…len=15
```

**ENV fallback disposition:** Railway `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` must be **reconciled or disabled** before treating recovery as closed. Vercel ENV alignment is a **separate follow-up**.

**Remaining ambiguity:** Vercel ENV health **UNVERIFIED**; worker proven on **ENV fallback path** while DB is ERROR, but fallback token is also unusable.

---

## Phase 7 — Legacy token write semantics (code review)

| Path | Detail |
| --- | --- |
| Endpoint | `PATCH /api/channel-settings/instagram` (`app/api/channel-settings/[channel]/route.ts`) |
| Auth | **ADMIN-only** (`requireAuth(..., ["ADMIN"])`) |
| Use case | `UpsertChannelSettingUseCase` → `supabaseChannelSettingRepository.upsertForTenant` |
| Fields written | `secret_json` keys `access_token`, `app_secret`, `verify_token`; fingerprints; optional `config_json` / `providerPageId` |
| Encryption boundary | **Fingerprints only** — legacy `secret_json` stored server-side as plaintext JSON (RLS/service-role protected), not OAuth ciphertext |
| Atomicity | Single-row upsert per channel |
| Status transition on save | **Does not auto-clear `lastError`** — `status` stays ERROR until cleared |
| Verification order | **Save-before-verification** — no Meta probe in upsert |
| Page identity verification on save | **NO** |
| Instagram account verification on save | **NO** |
| Wrong-account rejection on save | **NO** |
| Audit logging | Standard API logs only (no dedicated credential audit sink on legacy upsert) |
| Overwrite behavior | Non-blank `secrets` patch **overwrites** storage keys |
| Old token restore | **NO** automatic rollback |
| Worker observes new token | **Immediately** on next `getRuntimeConfig` once `lastError` cleared and status READY |
| Cache/redeploy | **No worker restart required** for DB read; **no Vercel redeploy** for DB token alone |

| Question | Answer |
| --- | --- |
| Write is atomic | **YES** (single upsert) |
| Token encrypted before persistence | **NO** (legacy plaintext in `secret_json`) |
| Identity verified before activation | **NO** (code gap) |
| Page + Instagram both verified | **NO** |
| ERROR status cleared on save | **NO** — requires successful Test Connection or manual `lastError` clear |
| Worker restart required | **NO** |
| Vercel redeploy required | **NO** |
| Railway redeploy required | **NO** |
| Rollback possible | **Forward-fix only** — expired token cannot be restored as success |
| Recommended recovery model | **Operator-side identity verification → PATCH token → controlled Test Connection → confirm READY** |

**Code gap flag:** `HOLD — LEGACY WRITE PATH LACKS IDENTITY-BEFORE-ACTIVATION` at code level; mitigated in runbook via **mandatory operator pre-verify** until a code fix lands (optional IG-CRED-1C).

---

## Phase 8 — Test Connection mutation analysis

| Behavior | Detail |
| --- | --- |
| Provider call | Graph GET (read-only at Meta) |
| Persists `lastError` | **YES** on failure |
| Clears prior error | **YES** on success (`lastError: null`, sets `lastVerifiedAt`) |
| Updates timestamps | **YES** (`updated_at`, `lastVerifiedAt`) |
| Exposes identity | Message/metadata only in API response |
| Safe after credential write | **YES** as **post-write verification** (authorized future gate only) |

**Classification:** **`CONTROLLED STATUS WRITE`** — include in future execution plan; **excluded from IG-CRED-1B probes**.

---

## Phase 9 — Queue / worker execution window

Snapshot: read-only `2026-06-22` (tenant `ba82…865f`, topic `message.outbound.requested`).

| Metric | Count |
| --- | --- |
| Pending (Instagram) | **0** |
| Processing (Instagram) | **0** |
| Dead-letter (Instagram, all time sample) | **2** failed since 2026-06-16 window |
| Global PENDING | **0** |
| Global PROCESSING | **0** |
| Global DEAD_LETTER | **45** (historical) |
| Scheduled retry | **0** observed |

| Question | Answer |
| --- | --- |
| DEAD_LETTER auto-requeue | **NO** |
| Credential recovery retries historical jobs | **NO** (by policy) |
| Immediate scheduled retry risk | **NO** |
| Worker pause decision | **NOT REQUIRED** (idle queue; atomic upsert) |

---

## Phase 10 — Controlled recovery runbook (planning only — NOT authorized)

### Pre-write gates

- [ ] `master` at reviewed SHA (post ENV alignment work if required)
- [ ] ADMIN operator on production tenant `ba82…865f`
- [ ] Expected Page `5418…len=15` confirmed with operator
- [ ] Expected Instagram Professional Account confirmed out-of-band (Meta Business settings)
- [ ] Fresh source arbitration — **Railway ENV page aligned or documented non-authoritative**
- [ ] Queue/outbox idle (PENDING=0, PROCESSING=0)
- [ ] Worker pause: **NOT REQUIRED** (current assessment)
- [ ] Replacement token obtained via **secure operator channel** (not chat/GitHub)
- [ ] Rollback/forward-fix plan documented
- [ ] No simultaneous deploy / ENV / flag change
- [ ] Explicit authorization phrase: `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`

### Write sequence (future authorized execution)

1. Operator verifies replacement token against Page `5418…len=15` and expected IG account (**out-of-band Meta check**).
2. `PATCH /api/channel-settings/instagram` with `secrets.accessToken` only (leave other secrets blank).
3. Confirm fingerprints show `access_token` SET; note `lastError` may still be present.
4. Run **controlled Test Connection** (authorized) — expect READY + cleared error.
5. Confirm UI Channel Settings **READY**.
6. Confirm worker `getRuntimeConfig` returns DB source (status no longer ERROR).
7. Ops: queue/outbox remain idle.
8. Read-only smoke: Channel Settings, Inbox shell, Ops — **no outbound message**.
9. Record ENV alignment status separately if Railway still mismatched.

### Stop rules

```text
DO NOT RETRY TOKEN WRITE AUTOMATICALLY
DO NOT WRITE ENV AND DB SIMULTANEOUSLY
DO NOT REQUEUE DEAD-LETTER JOBS
DO NOT START OAUTH
DO NOT SEND OUTBOUND SMOKE
HOLD AND INSPECT ON IDENTITY OR STATUS MISMATCH
```

### Recovery handling

| Scenario | Action |
| --- | --- |
| Provider rejects replacement token | HOLD — obtain new token; do not loop writes |
| Page identity mismatch | HOLD — do not persist |
| IG account mismatch | HOLD — do not persist |
| DB write OK but status still ERROR | Run Test Connection once (authorized) or inspect `lastError` |
| UI READY but worker uses ENV | HOLD — inspect `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` + ENV page alignment |
| Vercel/Railway divergence | HOLD — reconcile ENV before closure |
| Queue starts processing | HOLD — pause worker if non-zero pending appears |
| Uncertain save completion | Re-read Channel Settings fingerprints; do not double-paste token |

**Rollback:** Do not restore expired token. Forward-fix with valid identity-matched token only.

---

## Phase 11 — Recommended next authorization gate

```text
HOLD — ENV SOURCE OR IDENTITY UNRESOLVED
```

**Blockers before `READY FOR CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`:**

1. Railway ENV Facebook Page (`1137…len=16`) **≠** DB canonical page (`5418…len=15`).
2. Both DB and Railway ENV tokens **expired (`code=190`)** — replacement token required regardless.
3. Vercel ENV probe **UNVERIFIED**.
4. Legacy write path lacks **in-code identity-before-activation** (operator pre-verify required).

**Future authorization phrase (reserved):** `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Legacy token write | **NO** |
| Channel Settings save | **NO** |
| Test Connection (persisting) | **NO** |
| OAuth start/callback/reconnect | **NO** |
| Token refresh | **NO** |
| ENV / flag change | **NO** |
| Worker restart | **NO** |
| Queue retry/requeue | **NO** |
| Outbound smoke | **NO** |
| Migration operation | **NO** |

---

## IG-CRED-1B SOURCE ARBITRATION RESULT (summary block)

```text
IG-CRED-1B SOURCE ARBITRATION RESULT

PR #276 merge commit: 6fd5ff5a402037f8a8f05f7e71f8c381c57be61b
Latest master SHA: 6fd5ff5a402037f8a8f05f7e71f8c381c57be61b
Agent A synced master: YES
Agent B synced master: NO

Branch: docs/ig-cred-1b-source-arbitration-runbook
Evidence SHA: (set at commit)
Evidence PR: (set after gh pr create)

Resolver behavior:
- UI/Test Connection source: legacy channel_settings via getRuntimeConfigForConnectionTest
- Worker READY-state source: DB channel_settings via getRuntimeConfig
- Worker ERROR-state source: ENV fallback (DB_WITH_ENV_FALLBACK) on Railway
- ENV fallback trigger: DB runtime null when status ERROR or secrets incomplete
- Test Connection mutation classification: CONTROLLED STATUS WRITE

Credential-source inventory:
- DB credential: present, expired code 190, page 5418…len=15
- Vercel ENV credential present: YES (token SET; page id ABSENT in inventory)
- Railway ENV credential present: YES
- Vercel/Railway source consistency: PARTIAL — Railway has FACEBOOK_PAGE_ID; pages diverge
- Actual current worker source proven: ENV fallback path active (DB ERROR); ENV token expired

Health and identity:
- DB credential health: EXPIRED (code 190)
- DB Page identity: matches expected 5418…len=15
- DB Instagram identity: UNVERIFIED
- Vercel ENV credential health: UNVERIFIED
- Vercel ENV Page identity: UNVERIFIED
- Vercel ENV Instagram identity: UNVERIFIED
- Railway ENV credential health: EXPIRED (code 190)
- Railway ENV Page identity: MISMATCH (1137…len=16)
- Railway ENV Instagram identity: UNVERIFIED
- Identity mismatch found: YES (Railway ENV page vs DB canonical)

Canonical-source decision:
- Selected canonical source: Database channel_settings (page 5418…len=15)
- ENV fallback disposition: reconcile Railway/Vercel before closure
- Remaining ambiguity: Vercel ENV unverified; both tokens expired

Legacy write path:
- ADMIN-only: YES
- Atomic encrypted write: NO (plaintext secret_json; atomic upsert YES)
- Identity before activation: NO (operator pre-verify required)
- Page + Instagram identity guard: NO on save
- ERROR state clear behavior: via Test Connection success only
- Worker restart/redeploy required: NO
- Rollback/forward-fix posture: forward-fix with valid token only

Queue/outbox:
- Pending: 0
- Processing: 0
- Scheduled retry: 0
- Dead-letter: 2 tenant IG failures since expiry window; 45 global historical
- Worker pause decision: NOT REQUIRED
- Historical DLQ auto-requeue risk: NO

Runbook:
- Pre-write gates complete: YES (planning)
- Exact write sequence complete: YES (planning)
- Stop rules complete: YES
- Post-write read-only checks complete: YES (planning)
- Outbound smoke excluded: YES

Remote state changed: NO
Credential write executed: NO
OAuth reconnect executed: NO
Token refresh executed: NO
ENV changed: NO
Feature flag changed: NO
Queue retry executed: NO
Outbound smoke executed: NO
Migration operation executed: NO

Recommended path:
HOLD — ENV SOURCE OR IDENTITY UNRESOLVED

Decision:
READY FOR AGENT B REVIEW

Operational state:
HOLD — NO CREDENTIAL WRITE OR RECONNECT
```
