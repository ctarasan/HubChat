# Facebook Operator Runbook

Decision tree and step-by-step procedures for Facebook connectivity incidents.

---

## Safety rules (all procedures)

1. Never paste tokens, app secrets, or raw webhook payloads into chat or tickets
2. Never POST Messenger-only `subscribed_fields` to Graph — always use union repair
3. Never run `subscribe-default-tenant-facebook-page.mjs --apply` against SmartKorp
4. Do not change production Meta app config without change control
5. Do not merge or deploy code during incident triage unless explicitly in scope

---

## Quick status check

| Check | Where | PASS |
| --- | --- | --- |
| UI display state | Channel Settings → Facebook card | **CONNECTED** |
| Connection status | Same | **READY** |
| Health | Run health / Test connection | All six checks **PASS** |
| Messenger smoke | [messenger-smoke-test.md](./messenger-smoke-test.md) | M1–M5 PASS |
| Comment smoke | [facebook-comment-smoke-test.md](./facebook-comment-smoke-test.md) | C1 PASS |
| Worker | Railway dashboard / Ops Runtime | Healthy, processing jobs |
| Queue | `/dashboard/ops` | No stuck backlog |

---

## Decision tree

```text
Facebook issue reported?
│
├─ UI shows NOT_CONNECTED / NEEDS_RECONNECT
│   └─► Section A: Reconnect
│
├─ UI CONNECTED but messages missing
│   └─► Section B: Messages not arriving
│
├─ UI CONNECTED, Messenger OK, comments missing
│   └─► Section C: Comments not arriving
│
├─ Health FAIL on PAGE_WEBHOOK_SUBSCRIPTION
│   └─► Section D: Webhook subscription recovery
│
├─ Health PASS, smoke FAIL
│   └─► Section E: Worker / queue triage
│
└─ Intermittent / unclear
    └─► Section F: Full verification sweep
```

---

## Section A: Facebook disconnected

### A — Symptoms

- UI: `NOT_CONNECTED`, `NEEDS_RECONNECT`, or `ERROR`
- Health: `RECONNECT_REQUIRED` or credential FAIL
- Outbound fails immediately

### A — Steps

1. Open Channel Settings → Facebook card
2. Note display state and last health message (sanitized)
3. Click **Reconnect Facebook**
4. Complete Meta OAuth; select correct Page
5. Wait for **CONNECTING** → **CONNECTED**
6. Run health — confirm all six PASS
7. Run Messenger smoke M1 + M5

### A — Escalate if

- Reconnect loops back to NEEDS_RECONNECT
- Meta OAuth shows permission error
- Health FAIL on `REQUIRED_TASKS` after reconnect

---

## Section B: Messages not arriving

### B — Symptoms

- UI **CONNECTED**, health mostly PASS
- Messenger messages not in Dashboard
- Customer reports no response capability

### B — Steps

1. **Ingress check**
   - Send test message from safe account
   - Vercel logs: `POST /api/webhook/facebook` returned 200?

2. **If no webhook log**
   - Meta Developer Console: callback URL correct?
   - Page subscription includes `messages`? (health `PAGE_WEBHOOK_SUBSCRIPTION`)

3. **If webhook logged, no Dashboard message**
   - Railway worker: job claimed?
   - Ops Runtime: outbox/queue stuck?
   - See [../hubchat-worker-queue-observability-runbook.md](../hubchat-worker-queue-observability-runbook.md)

4. **If message in DB but not UI**
   - Hidden lead (PR #313): check hidden leads purge
   - Wrong tenant filter in Dashboard

5. **Outbound only broken**
   - Health: `RUNTIME_TEST_CONNECTION` FAIL?
   - Worker credential resolver enabled?

### B — Escalate if

- Webhook 200 + worker processing + still no message after 10 minutes
- Repeated worker failures on same error

---

## Section C: Comments not arriving

### C — Symptoms

- Messenger works
- Page comments not in Dashboard
- Private Reply unavailable or fails

### C — Steps

1. Run health — check `PAGE_WEBHOOK_SUBSCRIPTION`
2. If FAIL or missing `feed`:
   - **Do not** manual Messenger-only POST
   - Run health again (auto-repair) OR Default Tenant ops script dry-run → apply
   - See [webhook-subscription.md](./webhook-subscription.md)
3. If health PASS:
   - Confirm comment on correct Page post
   - Run Comment smoke C1
   - Check Vercel logs for feed `entry.changes` payload accepted
4. If webhook accepted but no Dashboard:
   - Worker logs for comment normalization errors

### Classic pattern (2026 incident)

Messenger PASS + Comment FAIL = suspect missing `feed` in Page subscription.

---

## Section D: Webhook subscription recovery

### D — Symptoms

- Health FAIL: `PAGE_WEBHOOK_SUBSCRIPTION`
- Message: incomplete fields or app missing
- Connection downgraded from READY to ERROR

### D — Steps

1. Read health message — note missing fields (should not include token data)
2. **SmartKorp production Page:**
   - Channel Settings → Run health (triggers union repair)
   - If FAIL persists → Reconnect
3. **Default Tenant App Review Page:**
   - Dry-run ops script (no POST)
   - Review planned `finalFields` includes `feed`
   - `--apply` only if dry-run shows fields to add
   - See [ops-script.md](./ops-script.md)
4. Re-run health — confirm PASS
5. Run Comment smoke C1 + Messenger smoke M1

### Never do

- POST `subscribed_fields=messages,messaging_postbacks,...` without `feed`
- Run ops script `--apply` on SmartKorp

---

## Section E: Worker / queue triage

### E — Symptoms

- Webhook ingress PASS (Vercel 200)
- Dashboard empty or delayed
- Ops Runtime shows backlog

### E — Steps

1. Confirm Railway worker service running
2. Ops Runtime (`/dashboard/ops`): queue depth, failed jobs
3. Check worker logs for Facebook processing errors
4. Compare with [../hubchat-worker-queue-observability-runbook.md](../hubchat-worker-queue-observability-runbook.md)
5. If maintenance gate active (ingress flags), check maintenance documentation

### E — Escalate if

- Queue growing unbounded > 30 minutes
- Worker crash loop

---

## Section F: Full verification sweep

Use after recovery or before App Review evidence capture.

| Step | Document | Expected |
| --- | --- | --- |
| 1 | [health-check.md](./health-check.md) | Six checks PASS |
| 2 | [messenger-smoke-test.md](./messenger-smoke-test.md) | M1–M5 PASS |
| 3 | [facebook-comment-smoke-test.md](./facebook-comment-smoke-test.md) | C1 PASS |
| 4 | [assisted-connection.md](./assisted-connection.md) | UI CONNECTED |
| 5 | Ops Runtime | Worker + queue healthy |

Record PASS/FAIL with timestamps. No secrets in record.

---

## Escalation matrix

| Condition | Escalate to | Bring |
| --- | --- | --- |
| Health FAIL after reconnect + repair | Engineering on-call | Health JSON (sanitized), timestamps |
| Graph POST fails consistently | Engineering + Meta app admin | Error message, Page ID, app ID |
| Data visible in DB, not UI | Frontend / Inbox team | Conversation ID, tenant ID |
| Multi-tenant webhook ambiguity | Engineering | Vercel log metadata, Page ID |
| App Review blocker | Product + Meta liaison | Smoke test results, health checks |

---

## Recovery confirmation checklist

After any recovery action:

- [ ] Health: all six checks PASS
- [ ] UI: CONNECTED
- [ ] Messenger smoke M1 + M5 PASS
- [ ] Comment smoke C1 PASS (if Comments in scope)
- [ ] Worker processing new events
- [ ] No token material in logs or ticket

---

## Related documents

- [README.md](./README.md) — knowledge pack index
- [architecture.md](./architecture.md) — pipeline overview
- [../postmortem/2026-facebook-recovery.md](../postmortem/2026-facebook-recovery.md) — incident history
- [../hubchat-webhook-smoke-runbook.md](../hubchat-webhook-smoke-runbook.md) — cross-channel ingress
