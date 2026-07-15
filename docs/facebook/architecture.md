# Facebook Architecture — HubChat Inbound Pipeline

How Facebook Page events reach the HubChat Dashboard.

---

## End-to-end flow

```text
Facebook / Meta
      │
      │  HTTPS webhook (signed)
      ▼
POST /api/webhook/facebook          ← Vercel (HubChat API)
      │
      │  verify signature, resolve tenant, normalize
      ▼
webhook_events + outbox rows        ← Supabase (persist + idempotency)
      │
      │  queue topic: message.inbound.normalized
      ▼
Railway worker                      ← claim job, resolve credential
      │
      │  upsert conversation + message
      ▼
messages + conversations            ← Supabase
      │
      ▼
Dashboard Inbox                     ← operator UI
```

### Stage responsibilities

| Stage | Responsibility |
| --- | --- |
| **Meta webhook delivery** | Delivers Page events for subscribed fields to the configured callback URL |
| **Webhook handler** | Validates `X-Hub-Signature-256`, resolves tenant from Page ID, parses payload |
| **webhook_events** | Raw event persistence and deduplication |
| **Outbox / queue** | Durable handoff to the worker (`message.inbound.normalized`) |
| **Worker** | Normalizes provider payload, resolves OAuth credential, writes messages |
| **Dashboard** | Displays conversations and supports outbound reply |

---

## Event kinds HubChat handles

### Messenger (`entry.messaging`)

Inbound direct messages from customers via Facebook Messenger.

- Parsed by `parseFacebookMessengerWebhookEvents`
- Requires Page `subscribed_fields` including `messages`
- Creates or updates a conversation keyed by customer PSID

### Message Echo (`message_echoes`)

Outbound messages sent by the Page (or HubChat) echoed back by Meta.

- Used to sync conversation state when the operator replies outside HubChat
- Requires `message_echoes` in Page subscription
- Enqueued as `facebook_messenger_echo` outbox events

### Facebook Comment (`entry.changes`, field=`feed`)

Public comments on Page posts.

- Requires Page `subscribed_fields` including **`feed`** (not `comments`)
- Normalized by `FacebookAdapter.receiveMessage`
- Appears in Dashboard as comment-thread conversations

### Private Reply

Operator-initiated Messenger message in reply to a public comment.

- Outbound path: HubChat sends via Graph API after comment is ingested
- Tracked on conversation rows (`facebook_private_reply_*` fields)
- Depends on comment being ingested first (therefore depends on `feed`)

### Feed (subscription field)

`feed` is a **Meta Page webhook subscription field**, not a message type in HubChat.

- Meta delivers comment and some Page activity events under `entry.changes` when `feed` is subscribed
- Without `feed`, Comment inbound silently stops even if Messenger still works
- **`comments` is a different subscription field** and does not substitute for `feed` in HubChat's Core configuration

---

## Tenant resolution

When a webhook arrives, HubChat resolves the tenant:

1. Extract Page IDs from webhook `entry[].id`
2. Look up `channel_connections` by `provider_page_id`
3. Fall back to `DEFAULT_TENANT_ID` env if no match (legacy path)
4. Refuse ambiguous multi-tenant matches with logged warning

OAuth-connected Pages should always resolve via `page_connection` lookup.

---

## Outbound path (summary)

```text
Dashboard send
      │
      ▼
POST /api/messages/send
      │
      ▼
Queue (token-free payload)
      │
      ▼
Worker → resolveFacebookWorkerOutboundConfig()
      │
      ▼
Graph API send (Page access token from channel_credentials)
```

Outbound uses encrypted `channel_credentials` at worker execution time. Tokens never appear in queue jobs or browser DTOs.

---

## Ingress vs subscription vs OAuth

| Concern | Where configured | What breaks if wrong |
| --- | --- | --- |
| **App-level webhook URL** | Meta Developer Console | No events at all |
| **Page `subscribed_apps`** | Graph API `/{page-id}/subscribed_apps` | Specific event types missing (e.g. no comments without `feed`) |
| **OAuth Page token** | HubChat Assisted Connection | Graph calls fail; health shows reconnect |
| **HubChat credential storage** | Supabase `channel_credentials` | Worker cannot send outbound |

All three layers must be healthy for full Messenger + Comment operation.

---

## Related documents

- [webhook-subscription.md](./webhook-subscription.md) — required fields and union repair
- [oauth-flow.md](./oauth-flow.md) — connection lifecycle
- [health-check.md](./health-check.md) — automated verification
- [operator-runbook.md](./operator-runbook.md) — triage decision tree
