# Facebook Page Webhook Subscription

How HubChat configures Meta Page `subscribed_apps` and why the union algorithm matters.

---

## Two subscription layers

Meta Facebook integration requires **both**:

| Layer | Configured in | Purpose |
| --- | --- | --- |
| **App webhook callback** | Meta Developer Console → Webhooks | Where Meta sends HTTPS POSTs |
| **Page subscribed_apps** | Graph API `POST /{page-id}/subscribed_apps` | Which event types Meta delivers for that Page |

HubChat production callback: `https://smartkorp-hub-chat.vercel.app/api/webhook/facebook`

This document covers the **Page subscribed_apps** layer.

---

## Required subscribed_fields

HubChat requires these six fields on the connected Page for the HubChat Meta app:

### Messenger fields (5)

| Field | Purpose |
| --- | --- |
| `messages` | Inbound customer Messenger messages |
| `messaging_postbacks` | Postback button clicks |
| `message_deliveries` | Delivery receipts |
| `message_reads` | Read receipts |
| `message_echoes` | Outbound message echo sync |

### Comment / Page activity field (1)

| Field | Purpose |
| --- | --- |
| `feed` | Facebook Comment inbound via `entry.changes` |

Combined constant: `FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS` in `facebookGraphOAuth.ts`.

---

## Why `feed` is required

Facebook Comment events arrive as Page webhook `entry.changes` payloads with `field: "feed"`.

Without `feed` in Page `subscribed_fields`:

- Messenger may continue working (if Messenger fields remain)
- **Facebook Comment inbound stops entirely**
- Private Reply flows break downstream (no comment to reply to)

Meta does not deliver comment webhooks through the Messenger `messages` field.

---

## Why `comments` is NOT a substitute for `feed`

Meta exposes multiple Page webhook subscription fields. **`comments` and `feed` are distinct fields.**

HubChat's Core App Review configuration requires **`feed`** specifically:

- Health verification checks for `feed`, not `comments`
- The union algorithm adds `feed` when missing
- Having `comments` subscribed does **not** satisfy `PAGE_WEBHOOK_SUBSCRIPTION` health check
- Tests explicitly assert `comments ≠ feed`

Do not assume subscribing to `comments` covers Comment inbound for HubChat.

---

## Safe subscription repair algorithm

All automatic paths (OAuth complete, operational health repair) and the manual ops script use:

```text
GET  /{page-id}/subscribed_apps
  │
  ▼
Union(existing_fields, required_fields)
  │  • preserve unknown extras (first-seen order)
  │  • trim whitespace
  │  • dedupe
  │  • append missing Messenger + feed
  ▼
POST /{page-id}/subscribed_apps  (subscribed_fields = union)
  │
  ▼
GET  /{page-id}/subscribed_apps   (verify)
  │
  ▼
evaluate: HubChat App present AND all required fields present
```

Implementation: `subscribeAndVerifyFacebookPageWebhook()` in `facebookPageWebhookSubscription.ts`.

### GET failure → no POST

If the initial GET fails, HubChat **refuses to POST**. A blind POST could overwrite existing fields (including `feed`) with an incomplete list.

Operator message: *"Could not read existing Page webhook subscription; refusing a destructive Messenger-only overwrite."*

---

## Production incident: Messenger-only POST

### What happened

The manual operator script `subscribe-default-tenant-facebook-page.mjs` (pre-PR #318) POSTed **only the five Messenger fields** without reading existing subscription state.

Meta's `subscribed_apps` POST **replaces** the field list for that app on the Page. The POST silently **removed `feed`**.

### Symptoms

- Messenger: continued working
- Facebook Comment: stopped
- Health: eventually FAIL on `PAGE_WEBHOOK_SUBSCRIPTION` (after PR #314)
- Dashboard: comments no longer appeared

### Fix timeline

| PR | Fix |
| --- | --- |
| #316 | Automatic paths (OAuth, health) use GET → Union → POST → Verify |
| #318 | Manual ops script uses same helper; dry-run by default |

---

## Verification logic

`evaluateFacebookPageWebhookSubscription()` checks:

1. HubChat Meta App ID appears in Page `subscribed_apps` list
2. `subscribed_fields` is a superset of all six required fields
3. Extra Meta fields are **allowed** (union preserves them)

PASS example fields: `messages, messaging_postbacks, message_deliveries, message_reads, message_echoes, feed`

PASS with extras: above plus e.g. `mention, ratings` — still PASS.

FAIL examples:

- App missing from subscribed_apps
- `feed` absent
- Any Messenger field absent

---

## Idempotency

When all required fields are already present:

- **Ops script** (`--apply`): skips POST (`skipPostIfAlreadyComplete: true`), still GET-verifies
- **OAuth / health repair**: always attempts POST if verification fails (may no-op at Meta if already complete)

---

## Manual inspection (operator-safe)

Use Meta Graph API Explorer or approved internal tooling to GET:

```text
GET /{page-id}/subscribed_apps
```

Confirm the HubChat app entry includes all six required fields. **Do not paste Page access tokens into tickets.**

---

## Related documents

- [health-check.md](./health-check.md) — `PAGE_WEBHOOK_SUBSCRIPTION` check
- [ops-script.md](./ops-script.md) — Default Tenant manual script
- [operator-runbook.md](./operator-runbook.md) — recovery steps
- [../postmortem/2026-facebook-recovery.md](../postmortem/2026-facebook-recovery.md) — full incident timeline
