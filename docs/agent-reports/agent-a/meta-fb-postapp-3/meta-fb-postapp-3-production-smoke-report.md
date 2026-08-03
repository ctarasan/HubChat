# META-FB-POSTAPP-3 — Controlled Production Facebook Inbound/Outbound Messaging Smoke

**Timestamp Asia/Bangkok:** 2026-08-03 ~09:50–10:25 +07:00  
**Agent:** A  
**Mutations:** controlled outbound send **once** only (inbound was operator-sent)

## FINAL VERDICT

**`PASS — CONTROLLED PRODUCTION FACEBOOK INBOUND/OUTBOUND MESSAGING SMOKE SUCCESSFUL`**

| Check | Result |
|---|---|
| INBOUND | **PASS** |
| OUTBOUND | **PASS** |
| delivery_status | **SENT** |
| external_message_id | **present** |
| duplicates | **none** (1 inbound + 1 outbound for gate texts) |
| queue/outbox | **healthy** (DONE / DISPATCHED only in 2h window) |
| post-smoke state | **healthy** |

---

## Phase A — Pre-smoke

READY / CONNECTED · SMARTKORP / `541846535686129` · webhook_active=true · PENDING=0 · AUTHORIZING=0 · no open queue/outbox failures.

Evidence: `pre-smoke-state.json`

---

## Phase B/C — Inbound

Operator sent **once** from Messenger → SMARTKORP:

`HubChat production smoke test inbound 2026-08-03`

| Field | Value |
|---|---|
| internal message ID | `af08b23c-12e4-42f0-be98-b9d3661eef67` |
| external message ID | `m_L5uZXaV2r5-GtS_j4_WfCaeJiI0QU4s8YZjN6IldKtAvcj21kLzTFoqv2VIfBXePgpd4fhwDlqImHh5qPaSzRg` |
| conversation ID | `34e5a6cb-9cdf-4f58-8d21-83ce344161d9` |
| lead ID | `f3dc4560-c4e2-4b85-bd41-da7f6d92d7e3` |
| persisted at | `2026-08-03 03:16:35.398418+00` |
| channel | FACEBOOK / MESSENGER_DM |
| Page | `541846535686129` |
| connection | `507d5519-…` |
| duplicate count | **1** |
| Inbox signal | conversation `last_message_preview` matches inbound text |

**INBOUND SMOKE = PASS**

Evidence: `inbound-smoke.json`

---

## Phase D/E — Outbound

HubChat reply **once**:

`HubChat production smoke test outbound 2026-08-03`

| Field | Value |
|---|---|
| send API | HTTP **202** QUEUED |
| internal message ID | `cd6f0ebf-c5e2-4232-8220-849f882344c4` |
| external_message_id | `m_D5CRqWD_XfhR6HqKfKbB06eJiI0QU4s8YZjN6IldKtBgySoeFut1jQLKpVGzbt6MmBHGNJN0vsXrauXluoQfzQ` |
| delivery_status | **SENT** |
| sent_at | `2026-08-03T03:22:16.942Z` |
| conversation | same as inbound (`34e5a6cb-…`) |
| duplicate count | **1** |

**OUTBOUND SMOKE = PASS**

Evidence: `outbound-smoke.json`

---

## Phase F — Post-smoke

| Check | Result |
|---|---|
| connection | READY |
| Page | SMARTKORP / `541846535686129` |
| webhook_active | true |
| PENDING / AUTHORIZING | 0 / 0 |
| REAUTHORIZE completed | 1 (no new OAuth) |
| channel_credentials | SET · fingerprint `ad389423f6a7` unchanged since reauth #2 |
| queue 2h | DONE only |
| outbox 2h | DISPATCHED only |

Evidence: `post-smoke-state.json`

---

## Explicitly NOT performed

- inbound resend / retry / webhook replay  
- second outbound  
- reauthorize / OAuth / credential / webhook / subscribed_apps mutation  
- POST `/health`  
- additional messaging / load tests  
- code change / merge / deploy  

---

## Evidence index

| File | Role |
|---|---|
| `meta-fb-postapp-3-production-smoke-report.md` | this report |
| `pre-smoke-state.json` | Phase A |
| `inbound-smoke.json` | Phase C |
| `outbound-smoke.json` | Phase E |
| `post-smoke-state.json` | Phase F |

**STOP**

Next gate: **Agent B independent review of META-FB-POSTAPP-3**
