# Agent Report — FPC-2G Facebook Page Self-Comment Suppression

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-12 |
| Phase | FPC-2G — Suppress Facebook Page-authored comment leads |
| Branch | `feature/fpc-2g-facebook-page-self-comment-suppression` |

## Root cause

Production showed multiple Facebook Comment leads named `SMARTKORP` with repeated promotional text. Meta feed webhooks for **Page-authored comments** send:

| Field | Page self-comment | Customer comment |
|---|---|---|
| `entry.id` | Facebook Page ID (receiving page) | Same |
| `value.from.id` | **Same Facebook Page ID** | Customer PSID / user ID |
| `value.from.name` | Page display name (e.g. `SMARTKORP`) | Customer name (may coincidentally match) |

**Match rule (stable IDs only):** suppress when `value.from.id === entry.id` (with optional `FACEBOOK_PAGE_ID` fallback when `entry.id` is absent). Display name is never used for suppression.

Page replies under customer comments use the same `from.id` (Page ID), so they are suppressed without creating a second lead thread.

## Fix

- `src/lib/facebookPageSelfComment.ts` — ID normalization, self-comment detection, webhook-only payload helper
- `facebookAdapter.ts` — skip feed comment ingest when sender Page ID equals receiving Page ID; structured log `ignored: facebook_page_self_comment`
- `webhook/facebook.ts` — return `200 { ignored: "facebook_page_self_comment" }` when payload is self-comment-only (mirrors reaction path)

## Guardrails preserved

- FPC-2F source post snippet/thumbnail enrichment unchanged for real customer comments
- FPC-2H reaction-only suppression unchanged
- FPC-1B multiline real-comment classification unchanged (no newline pollution logic)
- Missing `from.id` → fail-open (existing `continue`, not falsely suppressed)
- No DB migration; no deletion of existing bogus rows in this PR

## Observability

Structured logs only (no comment body, tokens, or raw payload):

```json
{
  "provider": "FACEBOOK",
  "ignored": "facebook_page_self_comment",
  "page_id_present": true,
  "commenter_id_present": true
}
```

## Read-only cleanup identification (later PR / ops)

Find existing self-authored bogus Facebook comment conversations where participant external user ID equals the connected Page ID:

```sql
-- Conversations likely created from Page self-comments (ID match, not display name)
select
  c.id,
  c.tenant_id,
  c.provider_page_id,
  c.provider_external_user_id,
  c.participant_display_name,
  c.last_message_preview,
  c.created_at,
  c.last_message_at
from conversations c
where c.channel_type = 'FACEBOOK'
  and c.provider_thread_type = 'FACEBOOK_COMMENT'
  and c.provider_page_id is not null
  and c.provider_external_user_id = c.provider_page_id
order by c.created_at desc;
```

Optional narrow filter for a known production page:

```sql
and c.provider_page_id = '<FACEBOOK_PAGE_ID>'
and c.participant_display_name ilike '%SMARTKORP%';  -- display-name hint only; cleanup should still key on ID match
```

## Verification

- `facebookPageSelfComment`, `facebookAdapter`, `facebook` webhook, `sourcePostIngestEnrichment`, `facebookInboundCommentKind` tests — pass
- Full suite, tsc, lint, build — pass
