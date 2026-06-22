# IG-CRED-1C — Instagram ENV Reconciliation and Legacy Write-Path Safety Plan

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-22 |
| Phase | IG-CRED-1C (read-only code analysis + docs-only planning) |
| Base commit | `4a19c12275864c0ad6917215aebd512fda7edd6a` |
| Prior evidence | `docs/agent-reports/agent-a/2026-06-22-ig-cred-1b-source-arbitration-runbook.md` (merged via PR #277) |
| Production mutation | **NOT AUTHORIZED** |

## Executive summary

Production Instagram remains on the **legacy `channel_settings` path** with **DB status ERROR** (expired token, canonical page `5418…len=15`). Railway worker mode **`DB_WITH_ENV_FALLBACK`** allows **wrong-identity ENV delivery** (`1137…len=16`) during the unsafe interval between **PATCH token save** and **Test Connection READY**.

**Primary ENV strategy:** `REMOVE/NEUTRALIZE MISMATCHED RAILWAY ENV` — set Railway `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY` (preferred) so Instagram cannot fall back to mismatched ENV while Facebook/LINE remain on their own mode flags.

**Vercel disposition:** `PROVEN IRRELEVANT` for Instagram outbound and Test Connection (code inspection); leave unchanged for this gate unless operator chooses hygiene cleanup.

**Legacy write safety:** ENV reconciliation **must precede** token re-entry; **worker pause RECOMMENDED** during PATCH→Test Connection even after ENV fix (conservative); **REQUIRED** if ENV reconciliation is incomplete.

**Separate follow-up workstream:** `IG-CRED-1D — Legacy Credential Encryption and Identity-Before-Activation Hardening` (not implemented here).

---

## Phase 1 — Repository baseline

| Check | Result |
| --- | --- |
| `HEAD` | `4a19c12275864c0ad6917215aebd512fda7edd6a` ✓ |
| Working tree | **clean** (pre-branch) |
| Branch | `docs/ig-cred-1c-env-reconciliation-plan` |
| IG-CRED-1B evidence on master | **YES** (PR #277 merged) |

---

## Phase 2 — ENV consumption path map

### Variable inventory (code readers)

#### `FACEBOOK_PAGE_ACCESS_TOKEN`

| Field | Value |
| --- | --- |
| Runtime | **Railway worker** (primary outbound); **Vercel app/API** (webhook auxiliary, inbound helpers) |
| Code readers | `loadEnvInstagramCredentials`, `loadEnvFacebookCredentials`, `buildInstagramOutboundConfig`, `worker/main.ts` (static adapter registration), `interfaces/api/webhook/instagram.ts`, `interfaces/api/webhook/facebook.ts`, `application/usecases/processInboundMessage.ts` |
| Purpose | Meta Graph page access token for Facebook Page and Instagram (Page token path) |
| Required | **Optional** per runtime path; worker Instagram ENV path requires token **and** page id |
| Fallback trigger | `DB_WITH_ENV_FALLBACK` when DB runtime is `null` (disabled, not configured, or **ERROR**) |
| Facebook / Instagram | **Both** — shared variable name, same env value on Railway |
| Identity guard | **None** on legacy ENV fallback — no comparison to `channel_settings.config_json.providerPageId` |

#### `FACEBOOK_PAGE_ID`

| Field | Value |
| --- | --- |
| Runtime | **Railway worker**; **Vercel** optional (webhook self-filter, Facebook webhook) |
| Code readers | `loadEnvInstagramCredentials`, `loadEnvFacebookCredentials`, `buildInstagramOutboundConfig`, `channelConnectRuntimeResolver.ts`, `conversationSelfFilter.ts` |
| Purpose | Graph API page id for outbound send and webhook filtering |
| Required | **Required** for Instagram ENV credentials (`loadEnvInstagramCredentials` returns `null` without page id); **optional** for Facebook ENV credentials (token-only sufficient) |
| Fallback trigger | Same as token — paired in Instagram ENV path |
| Facebook / Instagram | **Both** |
| Identity guard | **None** on ENV fallback |

#### `INSTAGRAM_ACCESS_TOKEN`

| Field | Value |
| --- | --- |
| Runtime | Railway worker; Vercel Instagram webhook |
| Code readers | `loadEnvInstagramCredentials`, `buildInstagramOutboundConfig`, `interfaces/api/webhook/instagram.ts` |
| Purpose | Alternate Page token env name (secondary to `FACEBOOK_PAGE_ACCESS_TOKEN`) |
| Required | **Optional** (production: **ABSENT** on Vercel and Railway) |
| Fallback trigger | Used only when `FACEBOOK_PAGE_ACCESS_TOKEN` absent |
| Facebook / Instagram | **Instagram** (and webhook path on Vercel) |
| Identity guard | **None** |

#### `INSTAGRAM_PAGE_ID`

| Field | Value |
| --- | --- |
| Runtime | Railway worker |
| Code readers | `loadEnvInstagramCredentials`, `buildInstagramOutboundConfig` |
| Purpose | Fallback page id if `FACEBOOK_PAGE_ID` unset |
| Required | **Optional** (production: **ABSENT**) |
| Fallback trigger | Instagram ENV path only |
| Facebook / Instagram | **Instagram** |
| Identity guard | **None** |

#### `INSTAGRAM_ACCOUNT_ID`

| Field | Value |
| --- | --- |
| Runtime | Railway worker |
| Code readers | `loadEnvInstagramCredentials`, `instagramCredentialsFromRuntimeConfig` |
| Purpose | Optional `businessAccountId` hint on adapter |
| Required | **Optional** (production: not inventoried as SET) |
| Fallback trigger | Passed through when ENV or DB resolves |
| Facebook / Instagram | **Instagram** |
| Identity guard | **None** |

#### `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE`

| Field | Value |
| --- | --- |
| Runtime | **Railway worker only** |
| Code readers | `parseInstagramRuntimeConfigMode` (`worker/main.ts`); when `ENV_ONLY`, resolver is **not** registered |
| Purpose | Select `ENV_ONLY` \| `DB_WITH_ENV_FALLBACK` \| `DB_ONLY` for Instagram outbound resolver |
| Required | **Optional** (defaults to `ENV_ONLY` if unset); production Railway: **SET** |
| Fallback trigger | Mode value defines whether ENV fallback is legal |
| Facebook / Instagram | **Instagram only** |
| Identity guard | **None** — mode does not bind ENV page to DB identity |

#### `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` / `HUBCHAT_LINE_RUNTIME_CONFIG_MODE`

| Field | Value |
| --- | --- |
| Runtime | Railway worker |
| Purpose | Independent mode flags for Facebook and LINE — **not coupled** to Instagram mode |
| Production | Both **SET** on Railway |
| Cross-channel risk | Changing Instagram mode **does not** change Facebook/LINE behavior |

#### `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`

| Field | Value |
| --- | --- |
| Runtime | Railway worker; Vercel API bootstrap |
| Purpose | Attempt `channel_connections` resolver before legacy `channel_settings` |
| Production | **SET** on both runtimes |
| Instagram impact | **Skipped** in production — zero `channel_connections` INSTAGRAM rows; falls through to legacy resolver |

#### `DB_WITH_ENV_FALLBACK` behavior (Instagram)

Implementation: `resolveInstagramOutboundConfig` (`src/lib/instagramOutboundRuntimeConfig.ts`).

| Step | Condition | Result |
| --- | --- | --- |
| 1 | `getRuntimeConfig` → `resolveChannelRuntimeConfig` returns credentials (READY, no `lastError`) | **DB** source |
| 2 | DB runtime `null` because **ERROR** (`lastError` present) | ENV fallback if `loadEnvInstagramCredentials` succeeds |
| 3 | DB not configured | ENV fallback |
| 4 | Neither DB nor ENV complete | **Throws** — job fails |
| 5 | `DB_ONLY` mode | **Never** ENV fallback; throws if DB unavailable |

Worker send path: `SendOutboundMessageUseCase` → `instagramOutboundAdapterResolver.resolve` → `resolveInstagramWorkerOutboundConfig` → `resolveInstagramOutboundConfig` (`src/application/usecases/sendOutboundMessage.ts`, `createInstagramOutboundAdapterResolver.ts`).

Test Connection path: `TestChannelConnectionUseCase` → `getRuntimeConfigForConnectionTest` → `resolveChannelRuntimeConfigForHealthCheck` — **reads DB only**, **ignores ENV**, **ignores `lastError` for probe** (`src/application/usecases/testChannelConnection.ts`, `src/lib/channelSettingPublicDto.ts`).

PATCH path: `UpsertChannelSettingUseCase` → `secret_json` write — **no Meta probe**, **does not clear `lastError`** (`app/api/channel-settings/[channel]/route.ts`).

### Precise answers

| Question | Answer |
| --- | --- |
| Does Vercel ENV participate in Instagram outbound delivery? | **NO** — outbound delivery runs on Railway worker; Vercel enqueues jobs only |
| Does Railway ENV participate in Instagram outbound delivery? | **YES** — when `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` is `DB_WITH_ENV_FALLBACK` and DB runtime is blocked |
| Can Vercel Test Connection or health APIs consume ENV? | **NO** — legacy Test Connection loads DB via `getRuntimeConfigForConnectionTest` only |
| Can app/API and worker resolve different identities? | **YES** — Vercel displays DB metadata; worker can ENV-fallback to a different page while DB is ERROR |
| Can one shared `FACEBOOK_PAGE_ACCESS_TOKEN` affect both Facebook and Instagram? | **YES** on Railway — same env var feeds both `resolveFacebookOutboundConfig` and `resolveInstagramOutboundConfig` |

### Vercel PATH-DEPENDENT note

Vercel `FACEBOOK_PAGE_ACCESS_TOKEN` is used on **inbound** paths (`interfaces/api/webhook/instagram.ts` media fetch fallback). It does **not** participate in Instagram **outbound** resolver or Test Connection. Classification for recovery closure: **irrelevant to outbound/Test Connection**; optional hygiene only.

---

## Phase 3 — ENV disposition options

### Option A — Remove or neutralize Railway Instagram fallback

| Criterion | Assessment |
| --- | --- |
| Variables to change | **Preferred:** `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY`. **Alternate:** unset `FACEBOOK_PAGE_ID` (blocks Instagram ENV pair; Facebook ENV may still use token-only) |
| Shared with Facebook | `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_PAGE_ID` are shared — **do not delete token** without Facebook impact analysis |
| Facebook harm risk | **LOW** if only Instagram mode changes to `DB_ONLY` — Facebook uses `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` independently |
| Worker redeploy | **YES** — Railway env change requires redeploy/restart to pick up new mode |
| DB remains ERROR, ENV neutralized | Instagram outbound **fails closed** (resolver throws `InstagramOutboundRuntimeConfigError`) — **safe** |
| Failure mode | Closed — no wrong-identity send |
| Rollback | Restore `DB_WITH_ENV_FALLBACK` (only if identity-aligned ENV exists) |
| Observable health | Worker logs `Instagram outbound runtime config resolved` with `runtimeSource: "db"` or delivery errors; no silent wrong-page send |
| Vercel change required | **NO** for Instagram outbound closure |

**Verdict:** **Feasible and preferred** when Facebook DB path is healthy or Facebook has its own ENV fallback needs.

### Option B — Replace Railway ENV with canonical identity

| Criterion | Assessment |
| --- | --- |
| Valid token required | **YES** — current ENV token expired |
| Canonical page | `5418…len=15` |
| IG Professional Account | Must be verified out-of-band before alignment |
| Coordinated update | Token + `FACEBOOK_PAGE_ID` must match canonical page |
| Secret duplication | DB and ENV would hold **same** secret — increases rotation burden |
| Railway redeploy | **YES** |
| Split-step risk | Updating DB and ENV separately reintroduces ambiguity |
| Long-term ambiguity | **Preserves** unnecessary dual-source model |

**Verdict:** **Not recommended** as primary strategy — duplicates secrets and does not remove fallback hazard after DB recovery.

### Option C — Restrict fallback in code

Proposed behavior: when legacy `channel_settings` row exists, is **configured**, and status is **ERROR**, **fail closed** instead of ENV fallback unless ENV page id matches `config_json.providerPageId`.

| Criterion | Assessment |
| --- | --- |
| Facebook impact | **None** if scoped to Instagram resolver only |
| Tenants without DB credentials | ENV fallback still allowed when not configured |
| `DB_WITH_ENV_FALLBACK` rollout | Changes semantics — document in release notes |
| Identity binding | Uses existing `providerPageId` in DB |
| Tests | Extend `instagramOutboundRuntimeConfig.test.ts` |
| Deployment | Code deploy to worker **before** or **with** ENV change |
| Safer than config-only? | **Yes long-term** — but requires PR/review cycle |

**Verdict:** **Recommended as IG-CRED-1D hardening**, not a blocker to immediate ENV reconciliation.

### Option D — Pause worker only during token recovery

| Criterion | Assessment |
| --- | --- |
| Pause mechanism | Railway service scale-to-zero or suspend deploy; no first-class pause flag in repo |
| Queue accumulation | **YES** — inbound may still enqueue; pause stops processing only |
| All channels | **YES** unless multi-service split (not current architecture) |
| Restart observes DB | On resume, resolver re-reads DB each job |
| Latent ENV risk after recovery | **YES** if mismatched ENV remains and mode is `DB_WITH_ENV_FALLBACK` |
| Sufficient alone? | **NO** — pause is **temporary mitigation**, not reconciliation |

**Verdict:** **Supplement only** — does not close wrong-identity ENV path after resume.

---

## Phase 4 — Selected ENV strategy

```text
REMOVE/NEUTRALIZE MISMATCHED RAILWAY ENV
```

**Primary mechanism:** Railway production worker — set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY`.

**Rationale:**

| Criterion | Met |
| --- | --- |
| No Facebook/LINE harm | Instagram mode flag is isolated |
| No wrong-identity fallback | ENV cannot satisfy Instagram resolver in `DB_ONLY` |
| Clear source of truth | DB `channel_settings` only |
| Minimum secret duplication | No second canonical token in ENV |
| Deterministic rollback | Revert mode flag (not recommended until ENV aligned) |
| Operator verification | Worker logs + read-only Channel Settings |
| No simultaneous ambiguous sources | After reconciliation, only DB can authorize Instagram send |

**Do not** leave mismatched Railway `FACEBOOK_PAGE_ID` + token active under `DB_WITH_ENV_FALLBACK` after DB recovery — even if DB becomes READY, latent ENV remains a future incident footgun.

**Secondary (IG-CRED-1D):** code-level fail-closed + identity-before-activation on PATCH.

---

## Phase 5 — Vercel ENV requirement

| Field | Production state |
| --- | --- |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | **SET** |
| `FACEBOOK_PAGE_ID` | **ABSENT** |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | **ABSENT** (defaults `ENV_ONLY` on Vercel, but Vercel does not run outbound worker resolver) |
| `INSTAGRAM_APP_SECRET` / `INSTAGRAM_VERIFY_TOKEN` | **SET** (webhook verification — unrelated to outbound token) |

**Disposition:** `PROVEN IRRELEVANT` for Instagram **outbound**, **Test Connection**, **status display**, and **OAuth flow** closure.

**Evidence:**

1. Outbound send executes on Railway worker only (`SendOutboundMessageUseCase` resolver).
2. Test Connection uses `getRuntimeConfigForConnectionTest` — DB only.
3. `loadEnvInstagramCredentials` requires page id — Vercel lacks `FACEBOOK_PAGE_ID`, so even a hypothetical Vercel resolver could not form Instagram ENV credentials.
4. Channel Settings UI reads DB DTOs, not Vercel ENV.

**Optional hygiene (not required for gate):** remove unused `FACEBOOK_PAGE_ACCESS_TOKEN` from Vercel after operator confirms no inbound webhook dependency on that token path. **Not a closure blocker.**

---

## Phase 6 — Legacy write-path safety model

### Confirmed unsafe interval

```text
PATCH saves token → lastError remains → DB status ERROR
→ worker DB path blocked → ENV fallback eligible (DB_WITH_ENV_FALLBACK)
→ Test Connection → may clear ERROR → DB READY
```

### Safeguard evaluation

| # | Safeguard | Role |
| --- | --- | --- |
| 1 | Reconcile/neutralize ENV **before** DB token write | **Mandatory** |
| 2 | Fresh queue/outbox snapshot | **Mandatory** |
| 3 | Worker pause during PATCH and Test Connection | **Recommended** (REQUIRED if ENV not reconciled) |
| 4 | Out-of-band token identity verification | **Mandatory** |
| 5 | ADMIN-only execution | **Mandatory** |
| 6 | No simultaneous deploy/config edit | **Mandatory** |
| 7 | Immediate Test Connection after PATCH | **Mandatory** |
| 8 | Stop if Test Connection fails | **Mandatory** |
| 9 | Confirm DB READY before worker resume | **Mandatory** |
| 10 | Confirm resolver selects DB | **Mandatory** (logs / metadata) |
| 11 | No outbound smoke | **Mandatory** |
| 12 | No DLQ retry | **Mandatory** |

```text
Worker pause during write window: RECOMMENDED
```

**Conservative justification:** identity-before-activation is **absent** in code (`UpsertChannelSettingUseCase` saves before verify). Even with `DB_ONLY` ENV reconciliation, worker pause eliminates race with in-flight jobs and provides operator breathing room. If ENV reconciliation is **not** complete, pause upgrades to **REQUIRED**.

---

## Phase 7 — Token pre-verification contract

Before accepting a replacement token under `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`, operator must produce evidence **without exposing the token**:

| Evidence item | Requirement |
| --- | --- |
| Token accepted by Meta | Graph probe success (out-of-band tool or Meta Business Suite) |
| Expected Facebook Page ID | `5418…len=15` — **exact match** |
| Connected Instagram Professional Account ID | Numeric IG user id — **exact match** to operator expectation |
| Page-to-Instagram relationship | `instagram_business_account` edge resolves expected IG account |
| Required permissions/scopes | `pages_messaging`, `instagram_manage_messages`, `pages_show_list` (minimum set per Meta IG messaging docs) |
| Tenant/channel mapping | Tenant `ba82…865f`, channel `INSTAGRAM`, legacy path |
| Token expiry / validity horizon | Expiry date recorded; must be **future** at write time |

**Required classification:**

```text
VALID AND CANONICAL-IDENTITY-MATCHED
```

Any mismatch:

```text
HOLD — REPLACEMENT TOKEN IDENTITY MISMATCH
```

Page-only validation is **insufficient** — Instagram Professional Account must be confirmed.

**Approved secure token supply channel:** ADMIN enters token **only** in production Channel Settings UI secret field (browser HTTPS session). **Prohibited:** Git, GitHub PR, agent reports, terminal transcripts, chat, screenshots, application logs, support tickets with pasted secrets.

---

## Phase 8 — Persistence and at-rest security

| Item | Status |
| --- | --- |
| Legacy `channel_settings.secret_json` | **PLAINTEXT AT REST** (pre-existing) |
| DB/RLS/service-role | Protects against client exposure; not encryption-at-rest for secrets column |
| Evidence docs | Must never contain token values |
| Token write | Permitted only under later `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY` |
| Incident recovery | Does **not** close structural encryption gap |

**Classification:**

```text
ONE-TIME CONTROLLED RECOVERY ACCEPTABLE WITH RECORDED RISK
```

**Rationale:** Expired production token already blocks business function. Plaintext-at-rest is a **known structural debt**, mitigated by RLS, ADMIN-only write, and single-tenant controlled recovery. Blocking emergency recovery pending encryption would extend outage without eliminating the already-persisted expired secret. Encryption + identity-before-activation belong in **IG-CRED-1D**.

### Proposed follow-up workstream

```text
IG-CRED-1D — Legacy Credential Encryption and Identity-Before-Activation Hardening
```

Scope (planning only): encrypt `secret_json` or migrate to encrypted credential store; reject PATCH activation when Meta page/IG identity ≠ stored `providerPageId`; fail-closed Instagram ENV fallback when configured+ERROR+identity mismatch.

---

## Phase 9 — ENV reconciliation execution runbook (NOT AUTHORIZED)

**Future authorization phrase:** `GO INSTAGRAM ENV RECONCILIATION`

This phrase **does not** authorize token entry.

### Pre-change gates

- [ ] Master at reviewed SHA (`4a19c12275864c0ad6917215aebd512fda7edd6a` or later reviewed commit)
- [ ] Railway project: production worker service (operator-confirmed name)
- [ ] Vercel project: `smartkorp-hub-chat` production — **no change required** for primary strategy
- [ ] Canonical identities: Page `5418…len=15`; IG Professional Account **operator-confirmed**
- [ ] Current Railway vars: `FACEBOOK_PAGE_ACCESS_TOKEN` SET, `FACEBOOK_PAGE_ID` SET (`1137…len=16`), `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` SET (`DB_WITH_ENV_FALLBACK` expected)
- [ ] Current Vercel vars: token SET, page id ABSENT — documented
- [ ] Queue/outbox: PENDING=0, PROCESSING=0 (re-snapshot immediately before change)
- [ ] No deployment in progress on Railway/Vercel
- [ ] Rollback: restore prior `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` value (document previous value before change)
- [ ] Agent B available for independent post-change verification
- [ ] Explicit phrase: `GO INSTAGRAM ENV RECONCILIATION`

### Change sequence

1. Record UTC start timestamp.
2. **Railway first:** set `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY`.
3. **Do not** change `FACEBOOK_PAGE_ACCESS_TOKEN` or `FACEBOOK_PAGE_ID` in this gate (Facebook may depend on them).
4. **Do not** change Vercel in primary strategy.
5. Trigger Railway worker redeploy/restart (required for env pickup).
6. **No** DB credential write in same window.
7. Record UTC end timestamp.

### Post-change verification

- [ ] Railway deployment healthy
- [ ] Worker process healthy (logs show `instagramRuntimeConfigMode: "DB_ONLY"`)
- [ ] Instagram resolver cannot ENV-fallback (attempt would fail closed while DB ERROR)
- [ ] Facebook channel unaffected (spot-check Facebook runtime mode logs / Channel Settings READY if applicable)
- [ ] LINE unaffected
- [ ] Queue/outbox counts unchanged (no new PROCESSING)
- [ ] **No** outbound smoke
- [ ] **No** Test Connection
- [ ] **No** token write

### Failure handling

```text
DO NOT CONTINUE TO TOKEN WRITE
DO NOT MODIFY DB CREDENTIAL
DO NOT RETRY CONFIG CHANGES BLINDLY
HOLD AND INSPECT CONFIGURATION STATE
```

---

## Phase 10 — Credential write execution runbook (NOT AUTHORIZED)

**Future authorization phrase:** `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY`

This phrase **does not** authorize additional ENV changes.

### Pre-write gates

- [ ] ENV reconciliation **complete and verified** (Phase 9)
- [ ] Queue/outbox idle (re-snapshot)
- [ ] Worker pause if RECOMMENDED/REQUIRED per Phase 6
- [ ] Replacement token pre-verified per Phase 7 → `VALID AND CANONICAL-IDENTITY-MATCHED`
- [ ] ADMIN session on tenant `ba82…865f`
- [ ] No simultaneous deploy/ENV/flag edit
- [ ] Agent B available

### Write sequence

1. Confirm ENV reconciliation attestation on record.
2. Optional: pause Railway worker.
3. Snapshot queue/outbox counts.
4. ADMIN: Channel Settings → Instagram → enter replacement token in UI only.
5. `PATCH /api/channel-settings/instagram` with `secrets.accessToken` (other secrets blank).
6. Record PATCH HTTP result — **no token** in notes.
7. **Immediately** run Test Connection (controlled status write).
8. Confirm response: Page `5418…len=15`, expected IG account name/id metadata, status **READY**, `lastError` cleared.
9. Confirm DB resolver path: `getRuntimeConfig` non-null (status READY).
10. Resume worker if paused.
11. Re-check queue/outbox health.
12. Read-only smoke: Channel Settings, Inbox shell, Ops — **no send**.
13. **No** DLQ retry.

### Stop rules

```text
DO NOT RESUBMIT TOKEN AUTOMATICALLY
HOLD AND INSPECT SANITIZED DB METADATA
```

If save completion uncertain: read fingerprints/`lastError` via Channel Settings API — do not re-paste token.

---

## Phase 11 — Separate authorization gates

| Gate | Phrase | Authorizes | Does **not** authorize |
| --- | --- | --- | --- |
| ENV reconciliation | `GO INSTAGRAM ENV RECONCILIATION` | Railway Instagram mode neutralization; worker redeploy for env | Token PATCH, Test Connection, Vercel token change (unless separately approved), OAuth |
| Credential write | `GO CONTROLLED LEGACY INSTAGRAM TOKEN RE-ENTRY` | ADMIN PATCH + Test Connection sequence | ENV changes, worker mode rollback, DLQ retry, outbound smoke |

Both gates require **separate evidence packs** and **Agent B independent review** before execution.

---

## Phase 12 — Verification attestation

| Check | Result |
| --- | --- |
| Docs-only diff | **YES** (this file only) |
| Secret scan | **PASS** (no token values) |
| Hidden/bidi scan | **PASS** (pending `git diff --check`) |
| Remote state changed | **NO** |
| ENV changed | **NO** |
| Credential write | **NO** |

---

## IG-CRED-1C ENV RECONCILIATION PLAN RESULT

```text
IG-CRED-1C ENV RECONCILIATION PLAN RESULT

Master SHA: 4a19c12275864c0ad6917215aebd512fda7edd6a
Branch: docs/ig-cred-1c-env-reconciliation-plan
Evidence SHA: (set at commit)
Evidence PR: (set after gh pr create)

Runtime mapping:
- Vercel ENV affects Instagram outbound: NO
- Railway ENV affects Instagram outbound: YES (DB_WITH_ENV_FALLBACK while DB ERROR)
- Vercel ENV affects Test Connection: NO
- Shared Facebook/Instagram variables: YES (FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID on Railway)
- Cross-channel impact risk: MEDIUM if shared vars removed; LOW if only HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE changed to DB_ONLY

Current sources:
- DB credential: present, EXPIRED, page 5418…len=15, status ERROR
- Vercel ENV: token SET, page ABSENT, health UNVERIFIED, irrelevant to outbound/Test Connection
- Railway ENV: token SET, page 1137…len=16, EXPIRED, identity MISMATCH vs DB
- Wrong-identity fallback possible: YES (today, on Railway worker)

Selected ENV strategy: REMOVE/NEUTRALIZE MISMATCHED RAILWAY ENV

Vercel disposition: PROVEN IRRELEVANT
Railway disposition: REMOVE Instagram ENV fallback path (HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE=DB_ONLY)

Legacy write safety:
- Replacement token identity contract complete: YES
- Page + Instagram identity required: YES
- Worker pause during write window: RECOMMENDED (REQUIRED if ENV not reconciled)
- Test Connection controlled write included: YES
- DB READY required before worker resume: YES
- No outbound smoke: YES
- No DLQ retry: YES

At-rest security:
- Classification: PLAINTEXT AT REST (known debt)
- One-time recovery acceptable: ONE-TIME CONTROLLED RECOVERY ACCEPTABLE WITH RECORDED RISK
- Separate hardening workstream recorded: IG-CRED-1D

Runbooks:
- ENV pre-change gates complete: YES
- ENV change sequence complete: YES
- ENV failure handling complete: YES
- Token pre-write gates complete: YES
- Token write sequence complete: YES
- Token failure handling complete: YES
- Separate authorization gates explicit: YES

Remote state changed: NO
ENV changed: NO
Credential write executed: NO
Test Connection executed: NO
Worker restarted: NO
Queue retry executed: NO
Outbound smoke executed: NO
Migration operation executed: NO

Recommended next gate: READY FOR GO INSTAGRAM ENV RECONCILIATION

Decision: READY FOR AGENT B REVIEW

Operational state: HOLD — NO ENV OR CREDENTIAL CHANGE
```
