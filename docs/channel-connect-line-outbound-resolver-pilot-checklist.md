# LINE Outbound Resolver Pilot — Operator Checklist (CCP-3.3-B)

Controlled **LINE-only** pilot for Channel Connect outbound resolution using **`DB_WITH_ENV_FALLBACK`** and `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` during an approved ops window.

**Status:** This pilot has **not** been executed in production yet. Follow this checklist only during a **future, scheduled controlled window** after Agent A CCP-3.3-A readiness sign-off.

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

---

## Scope and hard stops

| In scope | Out of scope |
|----------|----------------|
| LINE outbound text smoke in pilot window | Facebook / Instagram resolver pilot (separate checklists later) |
| `DB_WITH_ENV_FALLBACK` for LINE only | **`DB_ONLY`** — do not set for this pilot |
| Flag on only during window; flag off after | Marketplace module |
| Metadata evidence only | Pasting tokens/secrets into chat, tickets, or this doc |

**Never paste** channel access tokens, channel secrets, encryption keys, or raw credential values into Slack, email, tickets, or git.

---

## Related docs

| Document | Use |
|----------|-----|
| [`docs/channel-connect-outbound-rollout-readiness.md`](channel-connect-outbound-rollout-readiness.md) | Rollout prerequisites |
| [`docs/channel-connect-outbound-rollout-operator-smoke.md`](channel-connect-outbound-rollout-operator-smoke.md) | General multi-provider smoke |
| [`docs/channel-connect-outbound-rollout-evidence-pack.md`](channel-connect-outbound-rollout-evidence-pack.md) | Full evidence pack templates |
| [`docs/hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md) | Queue/outbox baselines |
| Agent A **CCP-3.3-A** LINE pilot readiness / ops wrapper | Technical steps, dry-run/execute procedure — link when merged |

---

## 1. Preflight (flag still OFF)

Complete **before** any Railway env change. All items must pass.

| # | Check | Pass criteria | Evidence (metadata only) |
|---|--------|----------------|---------------------------|
| P1 | Latest `master` deployed | Vercel + Railway worker on approved commit SHA | Vercel SHA: _____ Railway SHA: _____ |
| P2 | Worker healthy | Railway `/ready` → `healthy` | Link/ticket: _____ |
| P3 | Resolver flag **off** | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` unset or `false` | Worker log `channelConnectResolverEnabled: false` |
| P4 | LINE runtime mode (pre-pilot) | Typically `ENV_ONLY` until pilot window; **not** `DB_ONLY` | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` = _____ |
| P5 | LINE outbound via legacy/env **PASS** | Send controlled text; customer receives; `delivery_status` `SENT`; `external_message_id` set | Message id: _____ Job id: _____ |
| P6 | Channel Settings LINE | Dashboard **Channel Settings → LINE** shows enabled/READY (or runbook-equivalent ready state) | Screenshot link (no secrets): _____ |
| P7 | Ops Runtime baseline | Record outbound queue pending/processing/stale/dead-letter + outbox counts | See § Ops snapshot below |
| P8 | DB credential readiness dry-run | Agent A helper `prepareOutboundCredentialMigration` **dry-run** `valid: true` for pilot tenant — **no execute** in preflight | Dry-run summary: valid yes/no; connection id N/A until execute |

### Ops snapshot (preflight)

| Metric | Value |
|--------|--------|
| Outbound queue pending | |
| Outbound queue processing | |
| Outbound queue stale processing | |
| Outbound queue dead letter | |
| Outbox dead letter | |
| Captured at (timestamp) | |

**Preflight gate:** P1–P8 all PASS → proceed to §2. Any FAIL → **NO-GO**, do not enable flag.

---

## 2. Credential preparation

| # | Rule | Operator action |
|---|------|-----------------|
| C1 | No secrets in docs/chat/tickets | Use UUIDs, fingerprints, diagnostic codes only |
| C2 | Dry-run evidence only | Save dry-run plan: `WOULD_SET` / `MISSING`, warnings, errors — no plaintext |
| C3 | Execute only in approved window | `execute=true` + `dryRun=false` **only** per Agent A CCP-3.3-A during the migration window — not during preflight |
| C4 | Encryption key on Railway | Confirm `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` is set (**name only** in notes) before execute |
| C5 | Post-execute metadata | Verify `channel_credentials` metadata shows `SET` + fingerprint labels — never copy secret values |

**Do not** paste migration input JSON containing real tokens into any ticket.

---

## 3. Controlled flag-on pilot (future window only)

**Only during the scheduled pilot window** with rollback owner on standby.

| Step | Action | Verification |
|------|--------|--------------|
| F1 | Set `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` = **`DB_WITH_ENV_FALLBACK`** | Not `DB_ONLY` |
| F2 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` = **`true`** | Single tenant/pilot scope per Agent A runbook |
| F3 | Leave Facebook/Instagram modes unchanged unless runbook says otherwise | No cross-provider flag assumptions |
| F4 | **Restart / redeploy Railway worker** | Startup log shows `channelConnectResolverEnabled: true` |
| F5 | Confirm worker still healthy | `/ready` healthy after restart |
| F6 | Window timer | Record window start time; plan hard stop for rollback |

**Warning:** Do not leave the resolver flag `true` outside the approved window.

---

## 4. LINE outbound smoke (flag ON)

Use a **designated test conversation** only (fixture tenant).

| Step | Action | Expected |
|------|--------|----------|
| S1 | Send controlled **LINE text** reply from HubChat | Customer receives message in LINE |
| S2 | Queue job | Terminal **`DONE`**; `last_error` null |
| S3 | Message row | `delivery_status` = **`SENT`** |
| S4 | Provider id | **`external_message_id`** present (non-empty) |
| S5 | Config source (logs) | `resolutionPath: channel_connect_db` and/or `runtimeSource: db` when DB credential used; if `legacy_fallback`, document reason — unexpected fallback when DB expected → **NO-GO** |
| S6 | Secret leak check | Railway logs: **no** channel access token, channel secret, Bearer, Authorization, `plaintextSecret`, or `encrypted_secret_value` substrings |
| S7 | Ops delta | Outbound dead letter count does not increase vs §1 baseline |

| Field | Value |
|-------|--------|
| Test conversation id | |
| Test message id | |
| Queue job id | |
| Smoke result | PASS / FAIL |
| Log link (placeholder) | |

---

## 5. Rollback

Execute **immediately** on smoke FAIL, red-flag log, or at window end.

| Step | Action | Expected |
|------|--------|----------|
| R1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` = **`false`** | |
| R2 | Set `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` back per runbook (often `ENV_ONLY` until wider rollout) | Not `DB_ONLY` |
| R3 | **Restart Railway worker** | `channelConnectResolverEnabled: false` |
| R4 | Legacy/env outbound smoke | Repeat controlled LINE text send — **PASS** |
| R5 | Preserve DB data | **Do not delete** `channel_connections` / `channel_credentials` rows |
| R6 | Preserve evidence | Attach logs/ticket ids (no secret content) |

| Field | Value |
|-------|--------|
| Rollback completed at | |
| Rollback smoke result | PASS / FAIL |

---

## 6. GO / NO-GO

### GO (LINE pilot may proceed to next phase — e.g. extended pilot or FB/IG planning)

All required:

- Preflight §1 PASS (including flag-off LINE send)
- Credential dry-run valid; execute completed only if planned and metadata verified
- Flag-on smoke §4 **PASS**
- `delivery_status` **SENT**, `external_message_id` present, queue **DONE**
- Logs clean (§4 S6)
- No outbound dead-letter regression
- Rollback drill **validated** (either executed at end of window or tabletop-confirmed per ops policy)

### NO-GO (stop; keep flag OFF)

Any one triggers **NO-GO**:

| Trigger | Observed? |
|---------|-----------|
| Missing LINE credential / dry-run not valid | |
| Resolver error / `credential_decrypt_failed` when DB expected | |
| Missing `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` when DB path required | |
| Unexpected `ENV_FALLBACK` / `legacy_fallback` when DB credential expected | |
| Queue job retry storm, stuck **PROCESSING**, or new **DEAD_LETTER** | |
| Suspected secret leak in worker logs | |
| LINE delivery failure or missing `external_message_id` | |
| `DB_ONLY` used or proposed for this pilot | |

**Overall decision:** GO / NO-GO / DEFER

| Field | Value |
|-------|--------|
| Decision owner | |
| Decision timestamp | |
| Summary (no secrets) | |

---

## 7. Evidence table

Copy one row per phase. Store under `evidence/ccp-3-3-line-resolver-pilot-YYYY-MM-DD/`.

| Timestamp | Operator | Provider | Env mode (`HUBCHAT_LINE_RUNTIME_CONFIG_MODE`) | Resolver flag | Dry-run result | Smoke result | Rollback result | Final decision | Notes |
|-----------|----------|----------|-----------------------------------------------|---------------|----------------|--------------|-----------------|----------------|-------|
| | | LINE | e.g. ENV_ONLY / DB_WITH_ENV_FALLBACK | false / true | PASS / FAIL / N/A | PASS / FAIL / N/A | PASS / FAIL / N/A | GO / NO-GO / DEFER | |

**Dry-run result:** Record `valid: true/false` and credential states (`WOULD_SET` / `MISSING`) only — not input secrets.

**Smoke result:** PASS only if §4 S1–S7 satisfied during flag-on window.

---

## Safe log reference (LINE pilot)

| Safe to record | Never record |
|----------------|--------------|
| `channelConnectResolverEnabled` | Token values |
| `resolutionPath`, `runtimeSource` | `channel_secret`, `channelAccessToken` fields |
| `diagnosticCode`, `fallbackReason` | Bearer / Authorization headers |
| `event: channel_connect_runtime_resolver` | Raw webhook payloads |

---

## Marketplace

**Paused** — not part of this LINE pilot.
