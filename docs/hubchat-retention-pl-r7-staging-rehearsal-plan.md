# HubChat PL-R7-A: Staging Seeded Raw Payload Redaction Rehearsal Plan

Operator and engineering plan to **prove** existing `RAW_PAYLOADS` redaction when eligible rows exist.

**This rehearsal is staging or local only. Never production.**

- **Do not** target `https://smartkorp-hub-chat.vercel.app` or production Supabase.
- **Do not** enable `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` on production.
- Production execute must remain **disabled** until a separate approved production window (PL-R6 no-op already validated safety with 0/0).
- **No** media purge, message history purge, storage deletion, or new product features in PL-R7.

Related docs:

- Operator runbook: `docs/hubchat-retention-operator-runbook.md`
- Smoke inventory: `docs/hubchat-smoke-test-inventory.md`
- Optional seed SQL template: `scripts/retention-pl-r7-staging-seed.sql` (staging/local only, **not** a migration)

---

## Prerequisites

| Gate | Requirement |
|------|-------------|
| Production flag | Agent A confirms `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` is **off** on production and redeployed |
| Environment | Staging Vercel + staging Supabase **or** local `next dev` + local Supabase |
| Migrations | `retention_purge_runs` and execute columns already on `master` (no new migration in PL-R7) |
| Tenant | Disposable **test tenant** and ADMIN user — no real customer data |
| Policy default | `rawPayloadRetentionDays: 90` (see `src/lib/retentionPolicy.ts`) |

---

## What execute actually redacts (code truth)

Execute (`POST /api/retention/purge-runs/[id]/execute`, target `RAW_PAYLOADS` only):

1. **Webhook events** — `webhook_events.payload_json` set to `{}` when:
   - `tenant_id` matches auth tenant
   - `received_at` &lt; now − 90 days
   - `payload_json` is a non-empty JSON object (has at least one key)

2. **Message raw payloads** — `messages.raw_payload` set to `{}` when:
   - Parent `conversations.status` = `ARCHIVED`
   - `messages.created_at` &lt; now − 90 days
   - `raw_payload` is a non-empty JSON object

3. **Batch order** — webhooks first up to `batchLimit`, remaining budget for messages.

4. **Does not** delete rows, leads, conversations, message `body`, `media_url`, or storage objects.

---

## Seed data matrix

Use **synthetic** JSON only, e.g. `{"rehearsal":"pl-r7","slot":"W1"}` — no real tokens or customer payloads.

**Cutoff:** timestamps at least **120 days** before rehearsal `now` for eligible rows (buffer over 90-day policy).

| Slot | Table | Purpose | Setup |
|------|-------|---------|--------|
| **W1** | `webhook_events` | Eligible | `received_at` &lt; cutoff, `payload_json` non-empty |
| **W2** | `webhook_events` | Control (recent) | `received_at` ≥ cutoff, non-empty `payload_json` |
| **W3** | `webhook_events` | Control (already redacted) | `received_at` &lt; cutoff, `payload_json` = `{}` |
| **C-A** | `conversations` | Eligible parent | `status = 'ARCHIVED'`, `resolved_at` or `closed_at` old enough |
| **C-OPEN** | `conversations` | Control (active) | `status = 'OPEN'` (or non-ARCHIVED) |
| **M1** | `messages` | Eligible | On C-A, `created_at` &lt; cutoff, `raw_payload` non-empty |
| **M2** | `messages` | Control (recent on archived) | On C-A, `created_at` ≥ cutoff, non-empty `raw_payload` |
| **M3** | `messages` | Control (active conv) | On C-OPEN, old `created_at`, non-empty `raw_payload` |
| **M4** | `messages` | Column control | On C-A, same as M1 or M2; record `body`, `media_url`, `preview_url` before execute — must be **unchanged** after |

**Suggested minimum:** 2× W1, 2× M1, plus all controls (W2, W3, M2, M3, M4).

Record seeded UUIDs in the rehearsal ticket (ids only, not JSON content).

Apply seeds via `scripts/retention-pl-r7-staging-seed.sql` (edit placeholders) or manual SQL in staging Supabase SQL editor.

---

## Phase 1 — Dry-run verification (no mutation)

| Step | Action |
|------|--------|
| 1 | ADMIN login on **staging/local** |
| 2 | Open `/dashboard/ops` |
| 3 | Confirm **Retention dry-run** panel loads |
| 4 | Confirm disclaimer: *Dry-run only. No data will be deleted.* |
| 5 | `GET /api/retention/dry-run` — 200; response has policy/summary/samples only (sanitized) |
| 6 | Note `rawPayloadCandidates` / estimated raw payload counts — treat as **upper bound** (see below) |
| 7 | **DB check:** eligible W1/M1 `payload_json` / `raw_payload` still **non-empty** (no redaction yet) |

### Dry-run count caveats (expected)

- **Webhooks:** dry-run counts rows with `received_at` &lt; cutoff; execute only updates rows with **non-empty** `payload_json`.
- **Messages:** dry-run aggregates non-empty `raw_payload` on ARCHIVED conversations in the **365-day message-eligibility** bucket; execute applies a **90-day `created_at`** filter per message.

Do not fail rehearsal solely because UI dry-run count &gt; execute affected counts if DB proof on W1/M1 passes.

---

## Phase 2 — Audit snapshot

| Step | Action |
|------|--------|
| 1 | Optional notes: `PL-R7 staging rehearsal` |
| 2 | `POST /api/retention/purge-runs` with `{}` or `{ "notes": "..." }` **only** |
| 3 | Verify request has **no** `policy`, `summary`, `samples`, `generatedAt` |
| 4 | Confirm new run in **Recent audit snapshots**, status `DRY_RUN_SNAPSHOT` |
| 5 | Copy **purge run id** for execute |

Server recomputes dry-run at save time (`CreateRetentionPurgeRunSnapshotUseCase`).

---

## Phase 3 — Execute rehearsal

| Rule | Detail |
|------|--------|
| Flag window | Set `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED=true` on **staging/local only** for the rehearsal window |
| Target | `RAW_PAYLOADS` only |
| Confirm | Exact `EXECUTE RETENTION PURGE` |
| Runs | **One** execute per purge run id; second attempt should be blocked after `COMPLETED` |
| batchLimit | **Prefer** `5`–`10` via direct API: `{ "target": "RAW_PAYLOADS", "confirmText": "EXECUTE RETENTION PURGE", "batchLimit": 5 }`. Ops UI always sends `batchLimit: 100` — use UI only on a **disposable** staging tenant with small seed set |
| Coordination | Single operator click; agreed run id; Agent B observes UI if paired |

**Expected:**

- HTTP 200, run status **COMPLETED**
- UI count-only: `Webhook events affected: N` · `Message raw payloads affected: M`
- Audit history refreshes without showing raw payloads, message bodies, media URLs, or secrets

**Do not** run execute against production.

---

## Phase 4 — Post-execute DB verification

Run on **staging/local** DB only. Replace placeholders.

### Eligible rows redacted

```sql
-- W1 eligible: payload_json should be {}
select id, received_at, payload_json
from webhook_events
where tenant_id = :tenant_id and id in (:w1_ids);

-- M1 eligible: raw_payload should be {}; body/media_url unchanged
select id, conversation_id, created_at, raw_payload, body, media_url, preview_url
from messages
where tenant_id = :tenant_id and id in (:m1_ids);
```

### Controls unchanged

Compare before/after snapshots for W2, W3, M2, M3 (payload fields must match pre-execute). M4: `body`, `media_url`, `preview_url` unchanged.

### No deletes

```sql
select count(*) as leads_count from leads where tenant_id = :tenant_id;
select count(*) as conv_count from conversations where tenant_id = :tenant_id;
select count(*) as msg_count from messages where tenant_id = :tenant_id;
```

Counts must match pre-rehearsal. No media/storage deletion (out of scope for this API).

### Audit alignment

```sql
select id, status, execution_result, execution_error
from retention_purge_runs
where tenant_id = :tenant_id and id = :run_id;
```

`execution_result.affectedWebhookEvents` and `affectedMessageRawPayloads` must align with number of eligible rows redacted (N/M).

### App smoke (staging/local)

- `/dashboard` (Inbox) loads
- `/dashboard/leads` loads
- `/dashboard/ops` dry-run still loads

---

## Rollback and cleanup

1. Set `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` **off** on staging/local.
2. Redeploy staging/local Vercel project if needed.
3. Confirm production flag still **off** (Agent A sign-off).
4. Optional: delete seeded rows by known ids or reset staging DB.
5. Attach evidence: environment, tenant id, run id, UTC window, dry-run summary (counts only), execute N/M, before/after row counts, flag state — **no** payload JSON in tickets.

---

## Evidence checklist (ticket)

- [ ] Staging/local hostname documented
- [ ] Test tenant id (not production)
- [ ] Seed id list (W1, M1, controls)
- [ ] Dry-run summary screenshot (counts only)
- [ ] Purge run id
- [ ] Execute result N/M
- [ ] SQL confirmation eligible → `{}`, controls unchanged
- [ ] Flag disabled after window
- [ ] Production flag confirmed still off

---

## PASS / BLOCKED criteria

### BLOCKED — do not execute

- Production URL, production DB, or production tenant targeted
- Production execute flag not confirmed **disabled** and redeployed
- Staging migrations not applied
- No eligible seeded rows (expect 0/0 again)
- Execute flag left on production or staging after rehearsal without sign-off
- Unclear run id or multiple executes on same run without approval

### PASS — rehearsal complete

- [ ] Staging/local only throughout
- [ ] Dry-run: no mutation; samples sanitized; eligible payloads still non-empty pre-execute
- [ ] Snapshot: notes-only POST; server-side snapshot; run id captured
- [ ] Execute: one call, `COMPLETED`, `RAW_PAYLOADS`, exact confirm, flag on only for window
- [ ] Eligible W1/M1: `payload_json` / `raw_payload` → `{}`
- [ ] Controls W2/W3/M2/M3 unchanged; M4 body/media columns unchanged
- [ ] Leads/conversations/messages counts unchanged; no media/storage deletion
- [ ] OPEN conversation messages not redacted
- [ ] Audit `execution_result` counts match DB delta
- [ ] Flag off on staging/local after; production still off
- [ ] Inbox/Leads work on staging/local

### PASS WITH NOTES

- Dry-run summary higher than execute N/M but DB proof passes (counting rules differ)
- Execute via UI with `batchLimit` 100 on small disposable seed set

---

## Out of scope (PL-R7)

- Media / message history purge implementation
- Production execute rehearsal
- Worker/scheduler automation
- Package or API changes
- New migrations
