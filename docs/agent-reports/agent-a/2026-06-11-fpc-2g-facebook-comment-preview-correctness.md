# Agent Report — FPC-2G Facebook Comment Preview Correctness

## Root cause

Facebook Page `feed` webhooks include multiple `item` types. The adapter treated any `feed`/`comments` change with a `from.id` as a comment lead.

| Subtype | Previous behavior | Issue |
|---|---|---|
| `item: comment` + `message` | Real comment text | OK |
| `item: comment` without text | Graph comment fetch → `[comment]` if empty | OK when Graph fails |
| `item: reaction` | `[reaction]` via `value.item` | OK |
| `item: status` (new post) + `message` | Ingested as comment; `message` is **parent post text** | **Bug** — post text shown as lead comment |

Parent post text for source post context remains in `metadata_json.source_post_snippet` via PR #209 ingest — never used as lead comment after this fix.

## Fix

- Classify feed events (`facebookInboundCommentKind`) and skip non-comment items (`status`, `share`, `photo`, …) and remove/hide verbs.
- Reactions always preview as `[reaction]` without reading `message` (prevents post-body leak).
- Comment events keep existing webhook + Graph comment text resolution; parent post snippet stays in metadata only.

## Post-deploy smoke SQL

```sql
select
  left(c.id::text, 8) as conversation_id_short,
  c.channel_type,
  c.provider_thread_type,
  c.last_message_at,
  c.last_message_preview,
  left(m.id::text, 8) as message_id_short,
  m.created_at,
  m.message_type,
  m.direction,
  left(coalesce(m.content, ''), 200) as content_preview,
  m.metadata_json ? 'source_post_snippet' as has_source_post_snippet,
  left(coalesce(m.metadata_json->>'source_post_snippet', ''), 120) as source_post_snippet_preview
from public.conversations c
join public.messages m on m.conversation_id = c.id
where c.channel_type = 'FACEBOOK'
  and c.provider_thread_type = 'FACEBOOK_COMMENT'
order by m.created_at desc
limit 30;
```
