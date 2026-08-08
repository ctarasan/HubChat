# Facebook Comment Smoke Test

Verify Facebook Comment inbound, Dashboard display, and Private Reply outbound.

---

## Prerequisites

- All [Messenger smoke test](./messenger-smoke-test.md) prerequisites
- Page webhook subscription includes **`feed`** (verify via health `PAGE_WEBHOOK_SUBSCRIPTION` PASS)
- Test Facebook account that can comment on Page posts
- A Page post open for comments (published post on the connected Page)

**Critical:** Comment inbound requires `feed`, not `comments`. See [webhook-subscription.md](./webhook-subscription.md).

---

## Test matrix

| # | Test | Action | PASS criteria |
| --- | --- | --- | --- |
| C1 | Comment inbound | Post comment on Page post from test account | Comment appears in Dashboard |
| C2 | Webhook ingress | Check Vercel logs | `POST /api/webhook/facebook` accepted; feed change logged |
| C3 | Queue processing | Check Railway worker logs | Comment job processed |
| C4 | Persistence | Reload Dashboard | Comment thread persists |
| C5 | Private Reply | Send Private Reply from HubChat on comment thread | Customer receives Messenger message |
| C6 | Self-comment ignore | Page comments on own post (optional) | HubChat ignores Page self-comment (no duplicate noise) |

---

## Step-by-step: C1 Comment inbound

1. Identify a published post on the connected Facebook Page
2. From test user account, post unique comment: e.g. `HubChat smoke C1 <timestamp>`
3. Open HubChat Dashboard Inbox
4. Locate Facebook comment conversation

**PASS:** Comment text visible; linked to correct Page post context.

**FAIL:** No comment after 2 minutes → see Troubleshooting.

---

## Step-by-step: C5 Private Reply

1. Open the C1 comment thread in Dashboard
2. Use Private Reply action (if enabled in UI)
3. Send: e.g. `HubChat smoke C5 private reply <timestamp>`
4. Confirm test user receives Messenger message
5. Confirm HubChat records private reply state on conversation

**PASS:** Customer receives Messenger DM; conversation shows private reply sent.

**FAIL:** Private Reply fails → verify comment was ingested (C1 PASS) and Messenger outbound works ([messenger-smoke-test.md](./messenger-smoke-test.md) M5).

---

## Expected PASS summary

```text
C1 Comment inbound     PASS
C2 Webhook             PASS
C3 Worker              PASS
C4 Persistence         PASS
C5 Private Reply       PASS (if feature enabled)
C6 Self-comment        PASS (ignored as expected)
```

---

## Expected failures and meaning

| Symptom | Likely cause | First action |
| --- | --- | --- |
| Messenger works, comments do not | **`feed` missing** from Page subscription | Run health; check `PAGE_WEBHOOK_SUBSCRIPTION` |
| Health PASS but no comments | Wrong Page connected or wrong post | Verify `providerPageId` on Channel Settings |
| Webhook received, not in Dashboard | Worker normalization failure | Railway logs, sanitized error |
| Comment visible, Private Reply fails | Outbound/token issue | Messenger M5 + `RUNTIME_TEST_CONNECTION` |
| Comments stopped after ops script | Pre-#318 Messenger-only POST removed `feed` | Run ops script dry-run; apply union repair |

---

## Troubleshooting: comments specifically

### 1. Confirm `feed` subscription

Health check `PAGE_WEBHOOK_SUBSCRIPTION` must PASS.

If FAIL with missing `feed`:

- Do **not** POST Messenger-only fields manually
- Use health auto-repair or [ops-script.md](./ops-script.md) for Default Tenant

### 2. Confirm webhook payload shape

Comment events arrive as:

```text
entry[].changes[].field = "feed"
```

Not under `entry.messaging`. If only Messenger tests pass, subscription is the first suspect.

### 3. Distinguish `comments` vs `feed`

If Graph shows `comments` subscribed but not `feed`, HubChat health still FAILs. Union repair adds `feed`.

---

## Regression note (2026 incident)

Before PR #316/#318, a manual ops script POST overwrote Page subscription with Messenger-only fields, removing `feed`. Symptom pattern:

- Messenger smoke: PASS
- Comment smoke: FAIL
- Health (post-#314): FAIL on `PAGE_WEBHOOK_SUBSCRIPTION`

See [../postmortem/2026-facebook-recovery.md](../postmortem/2026-facebook-recovery.md).

---

## Related documents

- [webhook-subscription.md](./webhook-subscription.md) — why `feed` is required
- [messenger-smoke-test.md](./messenger-smoke-test.md) — Messenger baseline
- [health-check.md](./health-check.md) — subscription verification
- [operator-runbook.md](./operator-runbook.md) — recovery procedures
