# Channel Connect Outbound Rollout — Operator Evidence Pack

Production evidence templates for a **controlled** rollout of `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (CCP-3 worker integration).

**Use with:**

- Operator smoke steps: [`docs/channel-connect-outbound-rollout-operator-smoke.md`](channel-connect-outbound-rollout-operator-smoke.md)
- Rollout readiness / migration planning: [`docs/channel-connect-outbound-rollout-readiness.md`](channel-connect-outbound-rollout-readiness.md)
- Agent A CCP-3.2-A dry-run validator (when published): companion to credential migration helper — record **result label only**, never raw output containing secrets

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

**Rules:** Metadata only. No tokens, secrets, encrypted blobs, Authorization headers, or raw webhook payloads in this pack.

---

## How to use this pack

1. Copy this file (or export sections) into your team evidence folder: `evidence/ccp-3-2-outbound-rollout-YYYY-MM-DD/`.
2. Complete **§1 Run header** once per rollout window.
3. Complete **§2 Pre-rollout baseline** for LINE, Facebook, Instagram **before** any flag change.
4. Complete **§3 DB credential readiness** per pilot tenant (after Agent A migration/dry-run steps).
5. Enable flag only per readiness runbook — then complete **§4–5** per provider.
6. If anything fails, complete **§6 Rollback** before closing the window.
7. Sign **§7 GO/NO-GO** — attach log/screenshot **links** (placeholders below), not file contents with secrets.

**Out of scope:** `DB_ONLY` cutover evidence, marketplace, inbound webhook resolver, Setup Wizard/OAuth.

---

## 1. Run header template

| Field | Value |
|-------|--------|
| **Date/time** (with timezone) | |
| **Operator** | |
| **Environment** | `production` / `staging` |
| **Vercel deployment SHA** | |
| **Railway worker deployment / version** | Service name + release id or SHA |
| **Provider under test** (this packet section) | `LINE` / `FACEBOOK` / `INSTAGRAM` / `ALL` |
| **Runtime mode** (Railway) | `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` = |
| | `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` = |
| | `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` = |
| **`HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED`** | `false` (baseline) / `true` (pilot) — **name only, no value paste in public channels** |
| **Rollback owner** | |
| **Final GO/NO-GO** | `GO` / `NO-GO` / `DEFER` |

**Change window**

| Field | Value |
|-------|--------|
| Window start | |
| Window end | |
| Comms channel / ticket id | |
| Agent A runbook version / PR ref | |

---

## 2. Pre-rollout baseline evidence

Complete **per provider** while `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` is **off**.

### 2.1 LINE — flag-off baseline

| Field | Value |
|-------|--------|
| Flag-off outbound smoke result | PASS / FAIL |
| Test conversation id | |
| Test message id | |
| Queue job id | |
| `delivery_status` | |
| `external_message_id` present? | yes / no |
| Queue state before rollout — outbound pending | |
| Queue state before rollout — outbound processing | |
| Queue state before rollout — outbound stale processing | |
| Queue state before rollout — outbound dead letter | |
| Ops runtime baseline snapshot (link or ticket id) | |
| Current runtime mode | e.g. `ENV_ONLY` |
| Current credential source expected | `legacy` (`channel_settings` + deployment ENV) |
| Screenshot / log link (placeholder) | e.g. `evidence/.../line-flag-off-ops.png` |
| Notes | |

### 2.2 Facebook — flag-off baseline

| Field | Value |
|-------|--------|
| Flag-off outbound smoke result | PASS / FAIL |
| Messenger DM smoke | PASS / FAIL / N/A |
| Comment-origin path smoke (public ack) | PASS / FAIL / N/A |
| Test conversation id | |
| Test message id | |
| Queue job id | |
| `delivery_status` | |
| `external_message_id` present? | yes / no |
| Queue state before rollout (outbound pending / processing / stale / dead letter) | / / / |
| Ops runtime baseline snapshot (link) | |
| Current runtime mode | |
| Current credential source expected | `legacy` |
| Screenshot / log link (placeholder) | |
| Notes | |

### 2.3 Instagram — flag-off baseline

| Field | Value |
|-------|--------|
| Flag-off outbound smoke result | PASS / FAIL |
| DM text smoke | PASS / FAIL / N/A |
| Image outbound smoke (if supported in prod) | PASS / FAIL / N/A |
| Comment private reply smoke (if eligible fixture) | PASS / FAIL / N/A |
| Test conversation id | |
| Test message id | |
| Queue job id | |
| `delivery_status` | |
| `external_message_id` present? | yes / no |
| Queue state before rollout (outbound pending / processing / stale / dead letter) | / / / |
| Ops runtime baseline snapshot (link) | |
| Current runtime mode | |
| Current credential source expected | `legacy` |
| Screenshot / log link (placeholder) | |
| Notes | |

### 2.4 Global ops baseline (all providers)

Copy from [`docs/hubchat-final-smoke-evidence-template.md`](hubchat-final-smoke-evidence-template.md) §3 or `/dashboard/ops`:

| Metric | Before rollout |
|--------|----------------|
| Outbound queue pending | |
| Outbound queue processing | |
| Outbound queue stale processing | |
| Outbound queue dead letter | |
| Outbox pending / processing / stale / dead letter | |
| Worker `/ready` | healthy / unhealthy |
| Railway log link (placeholder) | |

**Baseline gate:** All three provider flag-off smokes **PASS** before proceeding to §3–4.

---

## 3. DB credential readiness evidence

**Metadata only** — per pilot **tenant** and **provider**. Do not paste credential values.

| Field | LINE | Facebook | Instagram |
|-------|------|----------|-----------|
| `channel_connection` exists | yes / no | yes / no | yes / no |
| `connection_id` (UUID) | | | |
| Connection `status` | e.g. `READY` | | |
| Provider account id matches expected | yes / no | yes / no | yes / no |
| Expected provider account id (label only) | e.g. bot id / page id | | |
| Credential `ACCESS_TOKEN` state | SET / MISSING / REVOKED / EXPIRED | | |
| Credential `CHANNEL_SECRET` state (LINE) | SET / MISSING / … | — | — |
| Credential `APP_SECRET` state (Meta) | — | SET / MISSING / … | SET / MISSING / … |
| `last_outbound_verified_at` or health timestamp | | | |
| **No raw secret visible** in UI/API response | yes / no | yes / no | yes / no |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` present on Railway (name only) | yes / no | yes / no | yes / no |
| Agent A dry-run validator result (when available) | PASS / FAIL / N/A | | |
| Dry-run ticket / log link (placeholder) | | | |
| Ready for flag-on pilot? | yes / no | yes / no | yes / no |

**Notes**

- `REVOKED` / `EXPIRED` on connection or credential → **NO-GO** until Agent A remediates.
- Use `scripts/ops/prepare-line-outbound-credential-migration.mjs` for LINE dry-run (default); do not attach raw validator stdout.
- **CCP-3.4 (2026-06-04):** Sanitized LINE preflight dry-run evidence — [`docs/agent-reports/agent-a/2026-06-04-ccp-3-4-line-pilot-preflight-dry-run-evidence.md`](agent-reports/agent-a/2026-06-04-ccp-3-4-line-pilot-preflight-dry-run-evidence.md). Local dry-run PASS; production P1–P7 not run; **HOLD** before flag-on.

### CCP-3.4 dry-run-only row (LINE preflight — metadata)

| Field | Value |
|-------|--------|
| Evidence doc | Agent A CCP-3.4 sanitized report (link above) |
| Master SHA at capture | `342fecbf989bde20c43d7bfea9f3c758ebb30060` |
| Mode | `dry_run` only (no execute) |
| `valid` | `true` |
| `ACCESS_TOKEN` / `CHANNEL_SECRET` plan | `WOULD_SET` / `WOULD_SET` |
| `connectionId` | `null` (no DB write) |
| Production P1–P7 | Not run — **HOLD** |
| Secret leak / DB write checks | PASS (sanitized metadata only) |
| Production worker flag-off log | NOT VERIFIED |
| Resolver flag | OFF at capture |

**CCP-3.4 production P1–P7 (2026-06-05):** [`docs/agent-reports/agent-a/2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md`](agent-reports/agent-a/2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md). P1–P7 **PASS** (sanitized). **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** (execution not approved; resolver flag **OFF**).

**CCP-3.4-SEC remediation (2026-06-05):** [`docs/agent-reports/agent-a/2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md`](agent-reports/agent-a/2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md). Remediation **DONE**; R1–R8 **PASS**; encryption key **PLANNED ONLY**. Aligns with planning-ready decision above; flag-on **not approved**.

**CCP-3.5 planning (2026-06-06):** [`docs/agent-reports/agent-a/2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md`](agent-reports/agent-a/2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md). Controlled flag-on window plan (docs-only). Decision **READY FOR SCHEDULED CONTROLLED FLAG-ON WINDOW**; execution **not authorized**; resolver flag **OFF**.

**CCP-3.6 execution evidence (2026-06-06):** [`docs/agent-reports/agent-a/2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md`](agent-reports/agent-a/2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md). Pre-window baseline templates + CCP-3.4 reference; **flag-on not executed**; decision **HOLD — PRE-WINDOW BASELINE INCOMPLETE** pending operator **GO FLAG-ON**.

---

## 4. Flag-on pilot evidence

Record **once per provider** when `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true` (pilot window only).

### 4.1 Flag enablement (shared)

| Field | Value |
|-------|--------|
| Timestamp flag enabled (local + UTC) | |
| Operator who applied change | |
| Railway service restarted? | yes / no |
| Worker startup log: `channelConnectResolverEnabled: true` | yes / no |
| Screenshot / log link (placeholder) | |

### 4.2 Per-provider pilot row

| Field | LINE | Facebook | Instagram |
|-------|------|----------|-----------|
| Runtime mode at pilot | | | |
| Test message sent (timestamp) | | | |
| Message id | | | |
| Queue job id | | | |
| `delivery_status` | | | |
| `external_message_id` present? | yes / no | yes / no | yes / no |
| **configSource observed** | `DB` / `ENV_FALLBACK` / `ENV_ONLY` / `legacy` | | |
| **diagnostics observed** (codes only) | e.g. `db_credential_found` | | |
| Worker log secret leak check | PASS / FAIL | PASS / FAIL | PASS / FAIL |
| **Result** | PASS / FAIL | PASS / FAIL | PASS / FAIL |
| Log link (placeholder) | | | |
| Notes | | | |

**Log fields to cite (safe):** `resolutionPath`, `runtimeSource`, `diagnosticCode`, `fallbackReason` — not env values.

---

## 5. Provider-specific smoke rows

Duplicate rows as needed for multiple test sends. **Never** paste message body if it contains tokens.

### 5.1 LINE

| # | Scenario | Message id | Queue job id | delivery_status | external_message_id? | configSource | Token leak check | Result |
|---|----------|--------------|--------------|-----------------|----------------------|--------------|------------------|--------|
| L1 | Text outbound | | | SENT | yes | | PASS / FAIL | PASS / FAIL |
| L2 | Image outbound (if supported) | | | | | | PASS / FAIL | PASS / FAIL |

### 5.2 Facebook

| # | Scenario | Message id | Queue job id | delivery_status | external_message_id? | configSource | Token leak check | Result |
|---|----------|--------------|--------------|-----------------|----------------------|--------------|------------------|--------|
| F1 | Messenger DM text | | | SENT | yes | | PASS / FAIL | PASS / FAIL |
| F2 | Comment-origin public acknowledgement | | | | | | PASS / FAIL | PASS / FAIL |
| F3 | Private reply (eligible fixture only) | | | | | | PASS / FAIL | PASS / FAIL |

### 5.3 Instagram

| # | Scenario | Message id | Queue job id | delivery_status | external_message_id? | configSource | Token leak check | Result |
|---|----------|--------------|--------------|-----------------|----------------------|--------------|------------------|--------|
| I1 | DM text | | | SENT | yes | | PASS / FAIL | PASS / FAIL |
| I2 | Image outbound | | | | | | PASS / FAIL | PASS / FAIL |
| I3 | Comment private reply (eligible) | | | | | | PASS / FAIL | PASS / FAIL |

---

## 6. Rollback evidence

Complete if pilot **FAIL**, red-flag log, or **NO-GO**.

| Field | Value |
|-------|--------|
| Rollback triggered at (timestamp) | |
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` set back to `false` | yes / no |
| Railway worker restarted | yes / no |
| Startup log: `channelConnectResolverEnabled: false` | yes / no |
| Legacy outbound smoke — LINE | PASS / FAIL |
| Legacy outbound smoke — Facebook | PASS / FAIL |
| Legacy outbound smoke — Instagram | PASS / FAIL |
| Queue recovered (pending/stale acceptable; dead letter delta noted) | yes / no |
| Outbound dead letter delta vs baseline | |
| **DB credentials left in place** (not deleted) | yes / no |
| Incident / ticket id | |
| Incident notes (no secrets) | |
| Log archive link (placeholder) | |

**Post-rollback gate:** All legacy smokes **PASS** before closing incident.

---

## 7. GO / NO-GO summary

### GO criteria (all required for pilot widen or close window as success)

| # | Criterion | LINE | Facebook | Instagram |
|---|-----------|------|----------|-----------|
| G1 | DB `configSource` used when migration expected | yes / no / N/A | yes / no / N/A | yes / no / N/A |
| G2 | No unexpected `ENV_FALLBACK` when DB expected | yes / no / N/A | yes / no / N/A | yes / no / N/A |
| G3 | No secret leakage in worker logs | yes / no | yes / no | yes / no |
| G4 | No new outbound dead letters vs baseline | yes / no | | |
| G5 | `delivery_status` = `SENT` for success-path smokes | yes / no | yes / no | yes / no |
| G6 | `external_message_id` present for success-path smokes | yes / no | yes / no | yes / no |
| G7 | Rollback path validated or rollback evidence complete | yes / no | | |

**Overall decision:** GO / NO-GO / DEFER

| Field | Value |
|-------|--------|
| Decision owner | |
| Decision timestamp | |
| Summary (1–3 sentences, no secrets) | |

### NO-GO triggers (any one → NO-GO)

| Trigger | Observed? | Notes |
|---------|-----------|-------|
| `credential_decrypt_failed` during pilot when DB expected | yes / no | |
| Missing `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` when DB path required | yes / no | |
| Provider account mismatch | yes / no | |
| Unexpected `ENV_FALLBACK` / `legacy_fallback` when DB expected | yes / no | |
| Queue jobs stuck in `PROCESSING` (stale threshold exceeded) | yes / no | |
| Token leak suspected in logs | yes / no | |
| Provider delivery failures increased vs baseline | yes / no | |
| `DB_ONLY` attempted in production smoke | yes / no | |

### After decision

| GO | NO-GO |
|----|-------|
| Archive this pack; update ticket; schedule next tenant per readiness runbook | Keep flag **off**; preserve §6; root cause with Agent A before retry |

---

## 8. Cross-links and related docs

| Document | Role |
|----------|------|
| [`docs/channel-connect-outbound-rollout-operator-smoke.md`](channel-connect-outbound-rollout-operator-smoke.md) | Step-by-step smoke procedure |
| [`docs/channel-connect-outbound-rollout-readiness.md`](channel-connect-outbound-rollout-readiness.md) | Rollout readiness, migration planning, flag discipline |
| [`docs/hubchat-smoke-test-inventory.md`](hubchat-smoke-test-inventory.md) | Inventory entry (CCP-3.1) |
| [`docs/hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md) | Queue/outbox interpretation |
| [`docs/hubchat-final-smoke-evidence-template.md`](hubchat-final-smoke-evidence-template.md) | General launch ops tables |
| Agent A CCP-3.2-A secure migration / dry-run helper | Expected companion — link report when merged; use §3 dry-run row |

**Marketplace:** paused — not in this evidence pack.

---

## Appendix — Quick reference (env names only)

| Variable | Purpose |
|----------|---------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | Master outbound resolver flag (`true` only in pilot) |
| `HUBCHAT_LINE_RUNTIME_CONFIG_MODE` | `ENV_ONLY` / `DB_WITH_ENV_FALLBACK` / `DB_ONLY` |
| `HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE` | Same |
| `HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE` | Same |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | Required for DB decrypt path |

**Safe log grep tokens:** `channelConnectResolverEnabled`, `resolutionPath`, `channel_connect_runtime_resolver`, `diagnosticCode`, `runtimeSource`

**Never grep for:** token values, `Bearer`, `Authorization`, `channel_secret=`, raw `payload`.
