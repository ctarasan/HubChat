# HubChat Lead Source Badge Operator Guide (SRC-1B)

Operator reference for Dashboard source badges that show **how a lead/conversation entered HubChat**.

## Badge labels

| Badge | Meaning for operators |
|-------|------------------------|
| Facebook · DM | Customer contacted the Page via Messenger direct message. |
| Facebook · Comment | Thread started from a public Page post comment. |
| Facebook · Private Reply | Comment-origin thread where a private reply has been sent (agent reached customer privately). |
| Instagram · DM | Customer contacted via Instagram direct message. |
| Instagram · Comment | Thread started from an Instagram comment. |
| Instagram · Private Reply | Comment-origin thread where a private reply has been sent. |
| LINE · Chat | LINE messaging thread. |
| Unknown | Channel/source could not be classified (escalate if persistent). |

## Where badges appear

1. **Dashboard Inbox row** — next to thread count under the customer name.
2. **Chat header** — in the badge row beside conversation/lead status pills.
3. **Context panel → Details** — `Lead source` field.
4. **Leads page** — Channel column (uses PR #196 lead source fields).
5. **Work Queue** — channel badge only (Workflow API has no source fields yet).

## DM vs Comment vs Private Reply

- **DM**: inbound arrived on the messaging (DM) thread. Reply in the main composer uses Messenger/IG DM APIs.
- **Comment**: inbound arrived on a comment thread. Public acknowledgement or comment workflows may apply before DM is available.
- **Private Reply**: comment-origin thread where HubChat already sent a one-time private reply to the commenter. Further outbound rules depend on product policy and customer DM response.

Badges do **not** show PSID, comment ID, post ID, or profile URLs.

## API contract (PR #196)

**GET /api/conversations** (Dashboard):

- `source_type` — `DM` | `COMMENT` | `PRIVATE_REPLY` | `CHAT` | `UNKNOWN`
- `source_label` — operator-safe label from backend (not shown raw in badge; UI uses combined channel + type label)
- `has_comment_context` — boolean
- `has_private_reply` — boolean

**GET /api/leads**:

- `sourceType`, `sourceLabel`, `hasCommentContext`, `hasPrivateReply` (camelCase)

**GET /api/workflow/items** (Work Queue):

- No source fields in this phase. Work Queue shows **channel badge only** until Workflow API is extended.

If older rows lack `source_type` / `sourceType`, UI falls back to legacy thread metadata (`provider_thread_type`, `private_reply_sent_at`) on conversation list rows only.

## Out of scope

- Facebook/Instagram profile image enrichment (parked pending Meta review).
- Marketplace, CDP, Marketing Automation bridges.
- Runtime mode changes (`DB_WITH_ENV_FALLBACK` remains; no `DB_ONLY` or resolver flag changes).
