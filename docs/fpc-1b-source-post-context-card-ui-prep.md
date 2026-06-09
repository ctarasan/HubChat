# FPC-1B — Source Post Context Card UI

**Status:** Ready for review (FPC-1A merged)
**Branch:** `feature/fpc-1b-source-post-context-card-ui`  
**Location:** Dashboard right-side Context panel → Details tab

---

## Purpose

Compact Source Post Context card for comment/private-reply leads. Presentational component + model adapter wired to FPC-1A `source_post_context` on each conversation list item.

## API (FPC-1A)

GET /api/conversations conversation list item DTO: `source_post_context` / `sourcePostContext`

| Field | UI use |
|-------|--------|
| `source_label` | Source badge |
| `post_thumbnail_url` | Thumbnail (safe HTTPS only) |
| `post_snippet` | Post text (2–3 lines) |
| `lead_comment_snippet` | Lead comment block |
| `private_reply_status` | Status badge (`sent` → Private reply sent) |
| `open_post_available` + `open_post_href` | Open post button (href never shown as text) |
| `fallback_message` | Missing post details copy |

## UI states

| State | Behavior |
|-------|----------|
| Facebook Comment | Thumbnail/placeholder, snippet, lead comment, reply badge, Open post |
| Instagram Private Reply | No thumbnail placeholder, snippet, lead comment, reply badge |
| Missing details | Badge + fallback copy |
| LINE / DM | Hidden |

## Guardrails

No provider IDs, tokens, secrets, profile URLs, or raw URLs rendered as visible text.
