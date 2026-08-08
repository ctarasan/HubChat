# Messenger Smoke Test — Facebook

Verify Facebook Messenger inbound, outbound, echo sync, and Dashboard persistence.

---

## Prerequisites

- Production deployment ready on Vercel
- Railway worker running and healthy
- Facebook connection status **READY**, UI **CONNECTED**
- Operational health: all six checks **PASS** (especially `PAGE_WEBHOOK_SUBSCRIPTION`)
- Safe test Facebook account (not production customer)

**Never log or paste Page access tokens, webhook signatures, or raw PSIDs in tickets.**

---

## Test matrix

| # | Test | Action | PASS criteria |
| --- | --- | --- | --- |
| M1 | Inbound message | Send Messenger message to Page from test account | Message appears in Dashboard Inbox within 2 minutes |
| M2 | Webhook ingress | Check Vercel logs for `POST /api/webhook/facebook` | 200 accepted; safe metadata logged |
| M3 | Queue processing | Check Railway worker logs | Job claimed and processed |
| M4 | Persistence | Reload Dashboard | Message still visible; conversation thread intact |
| M5 | Outbound reply | Reply from HubChat Dashboard | Message delivered to test account Messenger |
| M6 | Echo sync | (Optional) Send from Meta Page Inbox directly | Echo appears in HubChat if `message_echoes` subscribed |

---

## Step-by-step: M1 Inbound

1. From test Facebook account, open Page Messenger
2. Send unique test string: e.g. `HubChat smoke M1 <timestamp>`
3. Open HubChat Dashboard Inbox
4. Filter or search for Facebook channel
5. Confirm new conversation or message with exact test string

**PASS:** Message visible with correct timestamp and channel badge.

**FAIL:** No message after 2 minutes → see Troubleshooting.

---

## Step-by-step: M5 Outbound

1. Open the smoke-test conversation in Dashboard
2. Send reply: e.g. `HubChat smoke M5 reply <timestamp>`
3. Confirm delivery in test account Messenger app
4. Confirm message appears in HubChat thread (outbound bubble)

**PASS:** Customer receives message; HubChat shows sent state.

**FAIL:** Send fails in UI or customer does not receive → check worker logs and `RUNTIME_TEST_CONNECTION`.

---

## Step-by-step: M6 Echo (optional)

1. From Meta Business Suite or Page Inbox, send message to test customer
2. Wait for webhook delivery
3. Check HubChat for echoed message

**PASS:** Echo message ingested (requires `message_echoes` in subscription).

**FAIL:** Echo missing but inbound works → check subscription includes `message_echoes`; run health.

---

## Expected PASS summary

```text
M1 Inbound        PASS
M2 Webhook        PASS
M3 Worker         PASS
M4 Persistence    PASS
M5 Outbound       PASS
M6 Echo (opt)     PASS or N/A
```

---

## Expected failures and meaning

| Symptom | Likely layer | First check |
| --- | --- | --- |
| No webhook in Vercel logs | Meta app callback or DNS | Meta Developer Console webhook URL |
| Webhook 401/403 | Signature or verify token | App secret configuration |
| Webhook 200 but no Dashboard message | Queue/worker | Ops Runtime, Railway logs |
| Inbound works, outbound fails | Credential resolver / token | `RUNTIME_TEST_CONNECTION`, worker logs |
| Intermittent delay | Queue backlog | Ops Runtime queue depth |
| Message hidden in Inbox | Hidden Lead localStorage (PR #313) | Purge hidden leads; verify v2 key |

---

## Troubleshooting decision tree

```text
Message not in Dashboard?
├─ No Vercel webhook log?
│   ├─ Check Meta webhook subscription (app level)
│   └─ Check Page subscribed_fields include `messages`
├─ Webhook logged but worker silent?
│   ├─ Check Railway worker health
│   └─ Check Ops Runtime queue/outbox
├─ Worker error in logs?
│   ├─ Credential / tenant resolution
│   └─ Escalate with sanitized log excerpt
└─ Message in DB but not UI?
    ├─ Hidden lead (PR #313)
    └─ Browser cache / wrong tenant filter
```

---

## Related documents

- [health-check.md](./health-check.md) — pre-flight health validation
- [architecture.md](./architecture.md) — pipeline overview
- [operator-runbook.md](./operator-runbook.md) — full recovery runbook
- [../hubchat-webhook-smoke-runbook.md](../hubchat-webhook-smoke-runbook.md) — cross-channel smoke
