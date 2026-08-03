# META-FB-POSTAPP-2 — Recovery Report (Cursor interruption)

**Timestamp Asia/Bangkok:** 2026-07-31 ~16:25–16:40 +07:00  
**Agent:** Recovery / resume  
**Mutations during recovery:** **NONE**

## FINAL STATUS

**`BLOCKED — REAUTH FAILED; RETRY NOT AUTHORIZED`**

**Checkpoint:** **F — REAUTH_FAILED**

---

## Phase R1 — Local inventory

| Item | Result |
|---|---|
| Branch | `feature/facebook-supported-reauthorization` |
| HEAD | `758cbd9b53c77775408a8e99766596decc6bb7fa` (= reviewed HEAD) |
| Tracked dirty tree | none (untracked tmp/report files only) |
| Agent A evidence dir | present: `docs/agent-reports/agent-a/meta-fb-postapp-2/` (29 files) |
| Agent A report | `meta-fb-postapp-2-controlled-reauthorization-report.md` — already concluded failure |

**Action:** Read all existing evidence first. Did **not** overwrite Agent A evidence.

---

## Phase R2 — Live Production READ-ONLY

Method: `supabase db query --linked` (SELECT only). No POST `/reauthorize`, no OAuth create, no UI click, no retry.

### Connection

| Field | Live value |
|---|---|
| Status | **READY** |
| Page | **SMARTKORP** |
| Page ID | **541846535686129** |
| webhook_active | true |
| last_error_code | null |
| last_health_check_at | 2026-07-31 09:35:03.645+00 |
| updated_at | 2026-07-31 09:35:08.854+00 |

### Credential / binding

| Field | Live value | vs pre-reauth |
|---|---|---|
| Credential | ACTIVE v1 / fingerprint `8acbd90355a8` / updated 2026-06-30 | **unchanged** |
| Binding | ACTIVE FACEBOOK v1 / same IDs / updated 2026-06-30 | **unchanged** |

### OAuth / REAUTHORIZE

| Field | Live value |
|---|---|
| oauth_tx_total | 8 |
| REAUTHORIZE intents | **1** |
| AUTHORIZING | **0** |
| PENDING oauth | **0** |
| Known tx `8f13bf84-…` | **FAILED** / `ACCESS_DENIED` (terminal) |
| Duplicate REAUTHORIZE | none (only one row) |

Status histogram: COMPLETED=2, FAILED=1, EXPIRED=5 (no PENDING).

### Note on connection drift vs Agent A post-fail snapshot

Agent A `post-reauth-state.json` / `fail-conn.json` showed `last_error_code=ACCESS_DENIED` and `updated_at=2026-07-31 09:16:26.139+00`.

Live now: error cleared and `updated_at` advanced to **09:35**, aligned with `last_health_check_at=09:35:03`. This is a **health-check refresh**, not a successful reauth:

- credential fingerprint/version unchanged
- binding unchanged
- REAUTHORIZE tx still FAILED
- no new OAuth transaction after `8f13bf84-…`

---

## Phase R3 — Checkpoint determination

| Candidate | Evidence | Match? |
|---|---|---|
| A PRE-ACTION | REAUTHORIZE already created + UI start evidence | No |
| B AUTHORIZATION_STARTED | tx terminal FAILED; AUTHORIZING=0; PENDING=0 | No |
| C META_OAUTH_IN_PROGRESS | OAuth expired 09:27; browser session not live | No |
| D CALLBACK_RECEIVED | `callback_received_at` null; status FAILED | No |
| E REAUTH_COMPLETED | credential/binding not rotated; tx FAILED | No |
| **F REAUTH_FAILED** | Agent A report + live FAILED/ACCESS_DENIED + READY restored | **YES** |
| G UNKNOWN | state consistent across Agent A + live | No |

### Decision evidence (primary)

1. Agent A report: controlled reauth attempt **1** failed at Meta 2FA; closed via `user_denied` / `ACCESS_DENIED`
2. Live tx `8f13bf84-9436-4a95-b648-d8d9898b3165` = FAILED / ACCESS_DENIED
3. Live REAUTHORIZE count = 1 (no second attempt)
4. Credential v1 fingerprint unchanged → token not refreshed
5. AUTHORIZING = 0, PENDING = 0 → no active recovery transaction

---

## Phase R4 — Safety rule

Active/pending transaction? **No** (terminal FAILED).

However: the single Explicit-GO attempt was **already consumed and failed**.

Therefore: **do not start a new reauthorization**.

Not using `BLOCKED — EXISTING REAUTH TRANSACTION REQUIRES RECOVERY` because the prior tx is closed; the correct gate is failure / no-retry.

---

## Phase R5 — Resume action taken

**None.** Checkpoint F forbids retry.

Did **not**:

- click Re-authorize
- POST `/reauthorize`
- create OAuth state
- resume Meta browser OAuth
- messaging smoke
- subscribed_apps / webhook mutation
- credential rotation / activation

---

## Phase R6 — Post-reauth verification

**Not applicable as success verification.** Reauth did **not** complete.

Baseline integrity (read-only) after failed attempt:

| Check | Result |
|---|---|
| connection READY | PASS |
| Page SMARTKORP / 541846535686129 | PASS |
| credential ACTIVE v1 unchanged | PASS |
| binding ACTIVE unchanged | PASS |
| AUTHORIZING = 0 | PASS |
| REAUTHORIZE completed success? | **FAIL** (FAILED/ACCESS_DENIED) |
| duplicate OAuth | none |

---

## Recommended next (outside this recovery)

`REMAIN ON HOLD` until a **new explicit GO** authorizes a **new single** controlled reauthorization, with an operator able to complete Meta two-factor verification in the OAuth browser session.

Previous Explicit GO (1 attempt) is **exhausted**.

---

## Evidence written by recovery (additive only)

- `meta-fb-postapp-2-recovery-report.md` (this file)
- `recovery-state.json`
- `recovery-live-readonly-state.json` (partial first attempt; superseded by query JSON below)
- `recovery-conn.json` / `recovery-conn-detail.json`
- `recovery-cred.json` / `recovery-bind.json`
- `recovery-counts.json` / `recovery-known-tx.json`
- `recovery-reauth-rows.json` / `recovery-recent-oauth.json`
- `recovery-oauth-status-counts.json`

Agent A pre/post/fail/oauth/UI evidence left intact.

**STOP**
