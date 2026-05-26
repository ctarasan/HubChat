# Post-mortem: Outbound Queue False-DONE and Instagram Outbound Recovery

## Metadata

| Field | Value |
|-------|--------|
| Date (incident or first prod report) | 2026-05-26 |
| Date fixed on production | 2026-05-26 |
| Severity | Production-impacting during smoke validation (no confirmed real customer impact) |
| Affected surface | Outbound worker (`outboundWorker`), `SendOutboundMessageUseCase`, Instagram/Facebook outbound |
| Fix PRs | #81 (false-DONE / idempotency), #82 (runtime config binding), #83 (delivery snapshot binding) |
| Fix branch(es) | Merged via hotfix PRs above; token/runtime config corrected separately after worker fixes |
| Incident report | N/A — engineer-only |

**Status:** Closed

---

## 1. Summary

During outbound smoke testing, Instagram and Facebook outbound messages showed inconsistent delivery state. Some outbound jobs reached `queue_jobs.status = DONE` while the related message had no `external_message_id`, no terminal `delivery_status`, and no `AGENT_MESSAGE_SENT` marketing event.

PR #81 stopped silent false-DONE on idempotency skips. PR #82 and PR #83 fixed detached Supabase repository method calls that lost `this` and failed with `Cannot read properties of undefined (reading 'supabase')`. After worker fixes, an expired Instagram access token was corrected; final Instagram outbound text/image smoke passed with full terminal-state evidence.

---

## 2. Readiness inputs (required)

### 2.1 Reliable repro

- **Environment:** Production-like / pre-production validation (HubChat smoke testing)
- **Steps:**
  1. Send outbound message via API (Instagram or Facebook).
  2. Observe API returns queued / accepted.
  3. Inspect `queue_jobs`, `messages`, and `marketing_events` for the message.
- **Expected vs actual:**
  - **Expected:** `queue_jobs.status = DONE` only when message is terminal (`SENT` or `FAILED`), `external_message_id` set when sent, `AGENT_MESSAGE_SENT` recorded.
  - **Actual (initial):** `queue_jobs.status = DONE` with `messages.external_message_id = null`, non-terminal delivery state, no `AGENT_MESSAGE_SENT`.
- **Notes:** Facebook recovered after PR #81; Instagram exposed further worker binding errors until PR #82 and #83; expired Instagram token visible only after binding fixes.

### 2.2 Root cause

Three distinct mechanisms:

1. **False-DONE on idempotency skip (PR #81)**
   - `outboundWorker` marks a job `DONE` when `SendOutboundMessageUseCase.execute()` returns without throwing.
   - The idempotency skip path could return while the message had not reached a terminal delivery state (`SENT` / `FAILED`).

2. **Detached repository methods — runtime config (PR #82)**
   - Channel settings repository methods were passed or invoked without preserving `this`.
   - `SupabaseChannelSettingRepository` methods that use `this.supabase` failed at runtime in Instagram outbound runtime resolver paths.

3. **Detached repository methods — delivery snapshot (PR #83)**
   - `reconcileIdempotentOutboundSkip` extracted `messageRepository.getDeliverySnapshot` as an unbound function.
   - `SupabaseMessageRepository.getDeliverySnapshot` lost `this`, causing the same `supabase` TypeError during idempotency reconciliation.

4. **Expired Instagram access token (operational)**
   - Not a code defect; surfaced after worker/runtime binding issues were fixed.

- **Primary files / symbols:**
  - `src/worker/outboundWorker.ts` — job completion vs use-case return
  - `src/application/usecases/sendOutboundMessage.ts` — `reconcileIdempotentOutboundSkip`, `execute`
  - `src/infrastructure/adapters/repositories/supabaseMessageRepository.ts` — `getDeliverySnapshot`
  - Outbound runtime resolvers / channel settings repository wiring (PR #82)
- **Evidence:** `TypeError: Cannot read properties of undefined (reading 'supabase')` at `getDeliverySnapshot`; channel settings binding error on Instagram outbound before PR #82.

### 2.3 Fix pointer

| PR | What changed |
|----|----------------|
| **#81** | Delivery snapshot reconciliation on idempotency skip; `SENT`/`FAILED` safe no-op; pending state throws retryable `OUTBOUND_IDEMPOTENCY_PENDING`; queue no longer silently `DONE` without terminal message state. |
| **#82** | Channel settings repository called through repository instance in outbound runtime config resolvers. |
| **#83** | `messageRepository.getDeliverySnapshot(messageId)` called on injected instance, not detached method reference. |

- **Diff focus:** Worker/use-case/repository wiring only; no queue/outbox schema or API contract changes in these PRs.

### 2.4 Validation result

| Check | Result |
|-------|--------|
| `git diff --check` | pass (docs PR) |
| `npm run typecheck` | pass (docs PR) |
| `npm run lint` | pass (docs PR) |
| `npm test` | pass (docs PR) |
| `npm run build` | pass (docs PR) |
| Production-like smoke | pass after PR #81–#83 and token/config correction |

**Final successful Instagram outbound evidence:**

- `queue_jobs.status = DONE`
- `queue_jobs.last_error = null`
- `messages.external_message_id` populated
- `metadata_json.delivery_status = SENT`
- `marketing_events.event_type = AGENT_MESSAGE_SENT`
- Instagram outbound image message confirmed sent

**Channel smoke (post-fix):**

| Path | Result |
|------|--------|
| Facebook inbound | PASS |
| Facebook outbound | PASS |
| Instagram inbound | PASS |
| Instagram outbound (text/image) | PASS |

- **Regression tests:** PR #81–#83 added/updated outbound idempotency and repository binding tests (see those PRs).
- **Validation note:** Fresh post-deploy messages used; stale pre-fix rows not used as pass/fail evidence.

---

## 3. Timeline (engineering)

| Event | Detail |
|-------|--------|
| Initial symptom | Outbound API queued; delivery not confirmed in DB |
| DB evidence | `external_message_id` null, `queue_jobs.status = DONE`, no `AGENT_MESSAGE_SENT` |
| PR #81 merged | False-DONE idempotency reconciliation |
| Facebook outbound | Recovered |
| Instagram failure | Channel settings `supabase` binding error |
| PR #82 merged | Runtime config repository binding |
| Instagram failure | `getDeliverySnapshot` `supabase` binding error |
| PR #83 merged | Delivery snapshot repository binding |
| Final blocker | Expired Instagram access token (config corrected) |
| Closed | Instagram outbound text/image smoke passed |

---

## 4. Impact

- **User impact:** No confirmed real production customer impact; found during HubChat smoke testing.
- **Data impact:** Some smoke-test rows showed inconsistent queue vs message state before fixes; no schema migration required for resolution.
- **Scope:** Outbound delivery path (Instagram and Facebook); worker and use-case layers.

---

## 5. What went well / what we learned

- DB checks clearly separated API, outbox, queue, worker, provider, and marketing event layers.
- PR #81 exposed downstream errors instead of hiding them as false-DONE.
- Each fix was small, focused, and regression-tested.
- Final validation used fresh post-deploy messages instead of stale pre-fix rows.
- Detached class method references (`repo.method` passed as callback) are a recurring footgun for `this.supabase` repositories.

---

## 6. Follow-ups

| Action | Owner | Tracking |
|--------|-------|----------|
| Add ops visibility for outbound messages/jobs stuck in `PENDING` delivery state and `DEAD_LETTER` outbound jobs | TBD | Dashboard / ops query |
| Add invariant check: `queue_jobs.status = DONE` without terminal message delivery (`SENT` / `FAILED`) | TBD | Test or periodic job |
| Audit remaining repository method injections for detached-method usage | TBD | Code review / lint pattern |
| Document token source-of-truth: **Channel Settings DB primary**, **Railway env fallback only**; never log token values | TBD | Ops/runbook doc |

---

## 7. References

- Fix PRs: #81, #82, #83
- Related code: `src/worker/outboundWorker.ts`, `src/application/usecases/sendOutboundMessage.ts`, `src/infrastructure/adapters/repositories/supabaseMessageRepository.ts`
- Tests (examples): `sendOutboundMessage.test.ts`, `sendOutboundMessage.deliverySnapshot.binding.test.ts`, `supabaseMessageRepository.deliverySnapshot.test.ts`
- Post-mortem index: [`docs/postmortems/README.md`](README.md)
