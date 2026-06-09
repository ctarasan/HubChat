# FPC-1B — Source Post Context Card UI Prep

**Status:** Draft / blocked on FPC-1A API  
**Branch:** `feature/fpc-1b-source-post-context-card-ui`  
**Location:** Dashboard right-side Context panel → Details tab

---

## Purpose

Compact Source Post Context card for comment/private-reply leads. Presentational component + model adapter; full API payload when FPC-1A merges.

## Proposed API (FPC-1A)

Nested on conversation detail: `source_post_context` / `sourcePostContext`

| Field | UI use |
|-------|--------|
| `postThumbnailUrl` | Thumbnail (safe HTTPS only) |
| `postSnippet` | Post text (2–3 lines) |
| `leadComment` | Lead comment block |
| `privateReplySent` | Status badge |
| `openPostAvailable` + `openPostHref` | Open post button (href never shown as text) |
| `postDetailsAvailable` | Full card vs fallback message |

## UI states

| State | Behavior |
|-------|----------|
| Facebook Comment | Thumbnail/placeholder, snippet, lead comment, reply badge, Open post |
| Instagram Private Reply | No thumbnail placeholder, snippet, lead comment, reply badge |
| Missing details | Badge + fallback copy |
| LINE / DM | Hidden |

## Guardrails

No provider IDs, tokens, secrets, profile URLs, or raw URLs rendered as visible text.
