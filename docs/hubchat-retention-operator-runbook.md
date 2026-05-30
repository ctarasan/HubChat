# HubChat Retention Operator Runbook (PL-R5)

Operator-safe guide for **Retention dry-run**, **audit snapshots**, and **guarded raw payload cleanup** on the ADMIN Ops Runtime page.

**Default production posture:** `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` is **off**. Treat execute as disabled unless an approved manual window explicitly enables it.

## Production target

- Canonical production domain: `https://smartkorp-hub-chat.vercel.app`
- Ops Runtime (ADMIN): `https://smartkorp-hub-chat.vercel.app/dashboard/ops`
- Related runbooks:
  - Worker/queue health: `docs/hubchat-worker-queue-observability-runbook.md`
  - Webhook ingress: `docs/hubchat-webhook-smoke-runbook.md`
  - Channel Settings confidence: `docs/hubchat-channel-settings-runtime-confidence-runbook.md`

## Safety rules (read first)

1. **Never paste secrets, tokens, raw payloads, or env values** into chat, tickets, or screenshots.
2. **Execute stays off by default.** Only enable the execute feature flag during an approved, time-boxed manual window.
3. **ADMIN only.** SALES and MANAGER cannot access retention execute APIs (403).
4. **No automatic execution.** Every cleanup batch requires explicit operator confirmation in the UI.
5. **Raw payload cleanup only.** This phase does not purge media files, message history, or storage objects.

---

## A. Concepts

### Retention dry-run

- **UI:** Ops Runtime → **Retention dry-run**
- **API:** `GET /api/retention/dry-run`
- **Meaning:** Read-only report of what *would* be eligible under current retention policy. **No rows are deleted or redacted.**
- **Shows:** Policy day counts, summary candidate counts, and **sanitized sample rows** (no message bodies, media URLs, or raw payloads).

### Save dry-run snapshot

- **UI:** Ops Runtime → **Retention audit snapshots** → **Save dry-run snapshot**
- **API:** `POST /api/retention/purge-runs` with `{}` or `{ "notes": "optional operator note" }` only
- **Meaning:** Persists an **audit record** in purge-run history. The server **recomputes** the dry-run at save time (client does not send policy/summary/samples).
- **Does not execute cleanup.**

### Raw payload cleanup (execute)

- **UI:** Per saved audit snapshot → **Execute raw payload cleanup**
- **API:** `POST /api/retention/purge-runs/[id]/execute`
- **Meaning:** **Manual, batched redaction** of stored raw webhook/message payload fields past the raw-payload retention cutoff. Server enforces **RAW_PAYLOADS** target only, exact confirm text, batch cap, tenant scope, and eligible run status.
- **Body (exact):**

```json
{
  "target": "RAW_PAYLOADS",
  "confirmText": "EXECUTE RETENTION PURGE",
  "batchLimit": 100
}
```

- **Result:** Count-only feedback (e.g. webhook events affected, message raw payloads affected). **No payload content** in API or UI responses.

### Dry-run vs audit snapshot vs execute

| Step | Mutates data? | Purpose |
|------|---------------|---------|
| **Dry-run** | No | Preview eligibility and counts |
| **Audit snapshot** | Yes (audit/history table only) | Record point-in-time policy/summary for compliance and execute anchor |
| **Execute raw payload** | Yes (controlled redaction of raw payload fields only) | Apply one bounded batch per approved window |

**Order of operations:** dry-run → review → save snapshot → operator approval → enable flag (window only) → exact confirm phrase → execute → verify counts → refresh audit history → disable flag.

---

## B. Safety boundaries

Raw payload cleanup in this phase **does not** delete or remove:

| Asset / surface | Removed? |
|-----------------|----------|
| Leads | **No** |
| Conversations | **No** |
| Message history (business message records) | **No** |
| Media files / attachments | **No** |
| Storage objects (buckets/files) | **No** |
| Channel settings | **No** |
| Provider connections / webhooks config | **No** |
| Inbox assignment or read state | **No** |
| Marketing timeline message bodies | **No** |

It redacts **raw payload storage** (webhook `payload_json` and message raw payload fields) for eligible rows past the configured raw-payload retention window, up to **batchLimit** per execute call. Backend guards block media/message/delete-all targets and unsafe execute bodies (see PL-R5-A API tests).

---

## C. Required controls

| Control | Operator / platform expectation |
|---------|--------------------------------|
| **ADMIN only** | `/dashboard/ops` retention panels and execute APIs require ADMIN; SALES receives 403 |
| **Exact confirm phrase** | UI button disabled until input equals `EXECUTE RETENTION PURGE` (case, spacing, no extra characters). API rejects wrong/partial/trimmed variants |
| **Feature flag** | `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` must be explicitly enabled for execute; otherwise API returns safe disabled response (503). **Leave disabled by default in production** |
| **Batch limit** | Each execute processes at most **100** units per request (combined webhook + message raw payload budget) |
| **Saved audit snapshot** | Execute targets a specific purge **run id**; run must be eligible (e.g. `DRY_RUN_SNAPSHOT`). Double execute on completed runs is blocked |
| **Server-side recompute** | Save snapshot and execute paths recompute dry-run server-side; operators must not rely on stale client policy/summary |
| **Audit run history** | Recent audit snapshots list via `GET /api/retention/purge-runs`; refresh after successful execute |
| **Raw-payload-only target** | Request `target` must be `RAW_PAYLOADS`; no MEDIA/MESSAGES/ALL paths in UI or API |
| **Cross-tenant isolation** | Execute cannot run against another tenant’s purge run id |
| **Response safety** | Execute/list/dry-run responses expose counts and metadata only—no raw payloads, tokens, or media URLs |

---

## D. When to run

Run raw payload execute only when **all** are true:

1. Dry-run counts were reviewed and match expectations.
2. An audit snapshot was **saved** and its run id recorded.
3. **Low-traffic window** approved with named operator on call.
4. **Ops Runtime** queue/outbox health is acceptable (see worker runbook).
5. **Channel/webhook smoke** is passing for production channels.
6. **Database migration/schema** for retention tables is confirmed deployed.
7. **Explicit operator approval** is documented (ticket with time window).
8. Execute flag is enabled **only** for that window.

---

## E. When NOT to run

Do **not** execute if:

- Dry-run counts are **unexpected** (spike, zero, wrong policy days).
- **Ops Runtime is unhealthy** (un triaged stale processing, critical backlog).
- **Channel smoke is failing** or webhook ingress is degraded.
- **Migration/schema state is uncertain**.
- The operator is **unsure** what cleanup will affect.
- **Execute flag was left enabled** outside an approved window—disable flag first; investigate before any execute.
- No **saved audit snapshot id** exists for the intended run.
- UI shows media/message purge, delete-all, or scheduler controls (should not exist—stop and escalate).

---

## F. Pre-execute checklist

- [ ] `/dashboard/ops` loads for ADMIN
- [ ] **Retention dry-run** panel loads (or documented safe unavailable state)
- [ ] Dry-run report reviewed; counts recorded in ticket (no secrets)
- [ ] **Save dry-run snapshot** succeeded; optional notes captured
- [ ] **Recent audit snapshots** lists the new run; **purge run id** copied
- [ ] Confirm execute target is **RAW_PAYLOADS only** (UI warning + API body)
- [ ] Confirm **no** media purge, message purge, delete-all, or scheduler controls on page
- [ ] Ops Runtime baseline acceptable (pending/stale/dead-letter per runbook)
- [ ] Channel smoke green
- [ ] `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` enabled **intentionally** only for this window (do not paste env values into docs/tickets)
- [ ] Confirm phrase typed exactly: `EXECUTE RETENTION PURGE`
- [ ] Plan **one batch** (`batchLimit: 100`); additional batches only after new review/snapshot

---

## G. Post-execute checklist

- [ ] Success UI shows **count-only** result (affected webhook events / message raw payloads)
- [ ] **Audit history refreshed** (run status updated in Recent audit snapshots)
- [ ] Page and network responses show **no** message content, raw payload JSON, media URL, signed URL, token, secret, JWT, or Bearer
- [ ] **Inbox** and **Leads** still load and behave normally (spot-check)
- [ ] **Ops Runtime** baseline did not worsen unexpectedly
- [ ] Re-run dry-run; compare counts to pre-execute snapshot
- [ ] **`HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` turned off** immediately after window
- [ ] Ticket updated with run id, operator, timestamp, and counts

---

## H. Incident / rollback steps

If execute fails, returns unexpected counts, or platform health degrades:

1. **Immediately disable** `HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED` on Vercel (and any worker env if applicable).
2. **Stop further execution**—do not click execute again; do not re-enable the flag until reviewed.
3. **Capture purge run id**, operator, and timestamp from audit history.
4. **Inspect audit history** on `/dashboard/ops` (status, safe execution error text only).
5. **Inspect Vercel API logs** (retention routes); **Railway worker logs** only if retention paths logged there—never attach raw payloads or tokens.
6. **Record affected counts** from UI/API (numbers only).
7. **Notify owner** (engineering lead / on-call).
8. **Do not retry** execute until root cause and dry-run deltas are reviewed.
9. **Do not** attempt media/message purge or storage deletion from other tools—out of scope.

---

## UI guardrails (what operators should see)

- Dry-run: *Dry-run only. No data will be deleted.*
- Audit: *Audit snapshot only. No data will be deleted.*
- Execute: *Manual raw payload cleanup only. Media files and message history will not be purged.*
- No buttons for media purge, message purge, delete all, or retention scheduler.
- Execute disabled until exact confirm phrase; with flag off, safe disabled/unavailable messaging (no false success).

**Automated coverage:** `docs/hubchat-smoke-test-inventory.md` (Retention lifecycle) and optional read-only `tests/e2e/retention-ops-smoke.spec.ts`.

**API safety regression (PL-R5-A):** `src/interfaces/api/retentionPurgeExecute.route.test.ts`, `src/application/usecases/executeRetentionPurgeRunRawPayloads.test.ts`, `src/lib/retentionPurgeExecute.test.ts` (CI via `npm test`).
