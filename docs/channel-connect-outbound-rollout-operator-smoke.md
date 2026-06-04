# Channel Connect Outbound Rollout — Operator Smoke Checklist

Operator-facing QA for controlled production rollout of the **Channel Connect outbound runtime resolver** (CCP-3). Use with Agent A’s technical rollout-readiness / credential migration runbook.

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

**Never record secrets.** Use env var **names**, message/job UUIDs, and safe log field names only.

---

## Purpose

Verify that outbound send for LINE, Facebook, and Instagram still works correctly when:

1. **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` is off** (required baseline before any rollout step).
2. **The resolver flag is turned on** in a controlled window (only after Agent A runbook preconditions are met).

This checklist does **not** migrate credentials, change Railway/Vercel env, or enable `DB_ONLY`.

---

## When to use this checklist

| Phase | Use this checklist? |
|-------|---------------------|
| Before first flag flip | **Yes** — complete **Pre-rollout** + **Flag-off** provider smokes |
| During pilot (`DB_WITH_ENV_FALLBACK` + flag `true`) | **Yes** — per-provider smokes + evidence table |
| After rollback (`flag` back to `false`) | **Yes** — **Rollback verification** section |
| Routine daily ops | No — use `docs/hubchat-worker-queue-observability-runbook.md` |
| `DB_ONLY` rollout | **Out of scope** — do not run this checklist for `DB_ONLY` |

---

## Pre-rollout safety checks

Complete **before** changing any production env var.

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | Vercel + Railway deploy same approved commit | SHA match or documented approved mismatch |
| 2 | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | **Unset or `false`** on Railway worker |
| 3 | Per-provider runtime mode (Railway) | Default **`ENV_ONLY`** unless Agent A runbook specifies otherwise; **not `DB_ONLY`** |
| 4 | Ops baseline captured | `/dashboard/ops` or `GET /api/ops/runtime` — outbound pending/processing/stale/dead-letter |
| 5 | Worker healthy | Railway worker `/ready` → `healthy` |
| 6 | Agent A runbook | Encryption key (`HUBCHAT_CREDENTIAL_ENCRYPTION_KEY`) and tenant connection readiness per runbook — **names only** in notes |
| 7 | Controlled window | Change window owner, rollback owner, and comms channel agreed |
| 8 | Evidence folder | Empty template rows ready (see **Evidence capture template**) |

**Env var names (reference only — do not paste values):**

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`
- `HUBCHAT_LINE_RUNTIME_CONFIG_MODE`
- `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE`
- `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE`
- `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` (required when flag on and DB path used)

---

## Provider-by-provider smoke tests

Run **flag-off baseline** for all providers first. Only proceed to flag-on smokes when Agent A approves the rollout step.

### LINE

#### A. Flag-off baseline (required before rollout)

| Step | Action | Expected |
|------|--------|----------|
| L1 | Confirm `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` is off | Worker log: `channelConnectResolverEnabled: false` |
| L2 | Send **text reply** from HubChat to a known LINE test conversation | Customer receives message in LINE app |
| L3 | HubChat message row | `external_message_id` present after worker completes |
| L4 | Delivery | `delivery_status` = `SENT` |
| L5 | Queue | Outbound job terminal `DONE`; `last_error` null |
| L6 | Logs | No raw token, channel secret, Bearer, or Authorization in Railway logs for this send |

#### B. Flag-on pilot (only after Agent A go-ahead)

| Step | Action | Expected |
|------|--------|----------|
| L7 | Runtime mode | `DB_WITH_ENV_FALLBACK` (not `DB_ONLY`) per runbook |
| L8 | Repeat L2–L6 | Same customer-visible success |
| L9 | Config source | Log shows `resolutionPath: channel_connect_db` **or** safe `legacy_fallback` with sanitized `fallbackReason` — record in evidence |
| L10 | Regression | Inbound LINE webhook still accepted (separate webhook runbook if needed) |

---

### Facebook

#### A. Flag-off baseline

| Step | Action | Expected |
|------|--------|----------|
| F1 | Confirm resolver flag off | Same as L1 |
| F2 | **Messenger DM** — send text reply from HubChat | Message delivered in Messenger thread |
| F3 | **Comment-origin** — use existing comment thread fixture | Public acknowledgement / private reply routing **unchanged** vs pre-rollout behavior |
| F4 | Private reply path | Only when conversation state allows; no new false `DONE` |
| F5 | Message row | `external_message_id` present; `delivery_status` = `SENT` |
| F6 | Queue | Job `DONE`; `last_error` null |
| F7 | Logs | No page access token or app secret in logs |

#### B. Flag-on pilot

| Step | Action | Expected |
|------|--------|----------|
| F8 | Repeat F2–F7 | Success criteria unchanged |
| F9 | Routing | `sendOutboundMessage` paths unchanged: Messenger DM vs comment private reply vs public ack — **no new route errors** |
| F10 | Config source | Record `channel_connect_db` vs `legacy_fallback` in evidence |

---

### Instagram

#### A. Flag-off baseline

| Step | Action | Expected |
|------|--------|----------|
| I1 | Confirm resolver flag off | Same as L1 |
| I2 | **Instagram DM** — send text reply | Delivered in Instagram DM |
| I3 | **Image outbound** (if enabled in prod) | `SENT`; image visible; queue terminal `DONE` |
| I4 | **Comment private reply** — eligible fixture only | Private reply path does not regress; no spurious “already sent” unless state requires |
| I5 | Message row | `external_message_id` present; `delivery_status` = `SENT` |
| I6 | Queue | Job `DONE`; `last_error` null |
| I7 | Logs | No access token or app secret in logs |

#### B. Flag-on pilot

| Step | Action | Expected |
|------|--------|----------|
| I8 | Repeat I2–I7 | Success criteria unchanged |
| I9 | Image validation | Unsupported media still fails locally per `mediaPolicy` — no false provider send |
| I10 | Config source | Record in evidence table |

---

## Evidence capture template

Copy one row per smoke attempt. **Do not paste tokens, secrets, or raw webhook bodies.**

### Run header

| Field | Value |
|-------|--------|
| Rollout phase | `flag-off-baseline` / `flag-on-pilot` / `post-rollback` |
| Tester | |
| Date/time (with TZ) | |
| Environment | `production` |
| Vercel commit SHA | |
| Railway worker commit SHA | |
| Ops baseline ref | Link or snapshot id (before/after) |

### Per-test row

| Date/time | Environment | Provider | Runtime mode | Resolver flag | Test conversation id | Test message id | Queue job id | delivery_status | external_message_id? | Worker log result | Config source observed | Result | Notes / rollback action |
|-----------|-------------|----------|--------------|---------------|----------------------|-----------------|--------------|-----------------|----------------------|-------------------|------------------------|--------|-------------------------|
| | production | LINE / FACEBOOK / INSTAGRAM | e.g. `ENV_ONLY`, `DB_WITH_ENV_FALLBACK` | `false` / `true` | UUID | UUID | UUID | `SENT` / `FAILED` | yes / no | safe / red-flag | `DB` / `ENV_FALLBACK` / `legacy` | PASS / FAIL | |

**Config source observed (pick one):**

- `DB` — logs show `resolutionPath: channel_connect_db` or `runtimeSource: db`
- `ENV_FALLBACK` — resolver used internal ENV fallback (CCP-2); worker may still show `legacy_fallback`
- `legacy` — flag off or `resolver_disabled_legacy_env` / `resolutionPath: legacy`

### Production evidence template (attach to GO packet)

Save as `evidence/ccp-3-1-outbound-rollout-YYYY-MM-DD.md` (or team drive equivalent):

1. Run header (filled)
2. All per-test rows for flag-off baseline → **must be PASS** before flag-on
3. All per-test rows for flag-on pilot (if executed)
4. Ops before/after table (from `docs/hubchat-final-smoke-evidence-template.md` §3)
5. Log search results (§ Log checks below)
6. Final GO/NO-GO (§ Final decision)

---

## Log checks

Search **Railway worker logs** for the test window only. Use safe filters; export redacted snippets if needed.

### Expected safe signals

| Signal | Meaning |
|--------|---------|
| `channelConnectResolverEnabled: false` | Baseline — no CCP DB reads |
| `channelConnectResolver: "disabled"` | Legacy path active |
| `resolutionPath: "legacy"` | Flag off or ENV_ONLY behavior |
| `resolutionPath: "legacy_fallback"` | Flag on; DB miss → legacy channel_settings/ENV |
| `resolutionPath: "channel_connect_db"` | Flag on; credentials from `channel_connections` |
| `runtimeSource: "db"` / `"env"` / `"channel_settings"` | Adapter resolution source (provider logs) |
| `event: "channel_connect_runtime_resolver"` | Structured resolver diagnostic (codes only) |
| `diagnosticCode: "db_credential_found"` | DB path success |
| `diagnosticCode: "resolver_disabled_legacy_env"` | Flag off — expected during baseline |
| Outbound processed / send completed | Worker completed outbound job |
| Queue job terminal `DONE` | Matches DB `queue_jobs` row |

### Red flags — stop and rollback if seen during GO smoke

| Red flag | Action |
|----------|--------|
| Raw access token substring (e.g. `EA…` long alphanumeric) | NO-GO; preserve logs; rollback flag |
| `channel_secret`, `app_secret`, `Bearer `, `Authorization:` | NO-GO |
| `encrypted_secret_value` or ciphertext blobs in logs | NO-GO |
| Full raw webhook `payload` in worker logs | NO-GO; escalate security review |
| `credential_decrypt_failed` when DB credential was expected | NO-GO unless runbook allows fallback test |
| `db_connection_missing` when READY connection expected | NO-GO for pilot tenant |
| Outbound `DEAD_LETTER` count increase vs baseline | NO-GO |
| Jobs stuck `PROCESSING` > stale threshold | NO-GO; check worker health |

**Safe log grep examples (metadata only):**

```text
channelConnectResolverEnabled
channel_connect_runtime_resolver
resolutionPath
runtimeSource
fallbackReason
diagnosticCode
```

Do **not** grep for env var values or token prefixes in shared channels.

---

## Rollback verification

If any red flag or provider smoke **FAIL** during flag-on pilot:

| Step | Operator action |
|------|-----------------|
| 1 | Set `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=false` on **Railway worker** (not Vercel unless runbook says otherwise) |
| 2 | Redeploy or restart Railway worker service |
| 3 | Confirm startup log: `channelConnectResolverEnabled: false` |
| 4 | Re-run **flag-off** smokes for affected provider(s) (LINE / Facebook / Instagram) |
| 5 | Confirm legacy path: `resolutionPath: legacy`, messages `SENT`, queue `DONE` |
| 6 | **Do not delete** `channel_connections` / `channel_credentials` rows during incident |
| 7 | Preserve log exports and evidence rows; mark rollout **NO-GO** |
| 8 | Open follow-up with Agent A / engineering — root cause before retry |

Post-rollback evidence: duplicate evidence table rows with phase `post-rollback` and Result = PASS required for GO reconsideration.

---

## Final GO / NO-GO decision

| Decision | Criteria |
|----------|----------|
| **GO** (continue pilot or widen) | All flag-off baseline rows PASS; ops delta acceptable; no red flags; flag-on rows PASS for pilot tenant(s); config source matches runbook intent (`DB` when migrated, or documented `legacy_fallback`); Agent A sign-off |
| **NO-GO** | Any provider FAIL; any red flag; dead-letter or stale processing regression; token-like substring in logs; flag left on without approval |

**Hard stops (never GO):**

- `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` without Agent A runbook approval
- `HUBCHAT_*_RUNTIME_CONFIG_MODE=DB_ONLY` for production rollout smoke
- Missing `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` when DB path required

---

## Related docs

| Doc | Use |
|-----|-----|
| `docs/hubchat-smoke-test-inventory.md` | Inventory entry for this smoke |
| `docs/hubchat-worker-queue-observability-runbook.md` | Queue/outbox baselines |
| `docs/hubchat-final-smoke-evidence-template.md` | Ops before/after tables |
| `docs/hubchat-channel-settings-runtime-confidence-runbook.md` | Legacy channel_settings path |
| Agent A CCP-3 / rollout runbook | Credential migration + flag flip procedure |

---

## Marketplace

**Paused** — no marketplace outbound smoke in this checklist.
