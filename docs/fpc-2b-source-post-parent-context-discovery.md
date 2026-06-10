# FPC-2B — Source Post Parent Context Discovery & Safe Persist Plan

**Date:** 2026-06-10  
**Status:** Discovery complete (docs-only)  
**Production:** Restored after PR #206 revert of FPC-2A (PR #205)

## Executive summary

The Details panel shows fallback because **parent post text is not persisted** on inbound messages today. The pipeline stores **comment text** (as `messages.content` / `last_message_preview`) and **provider IDs** on `conversations` (`provider_post_id`, `provider_comment_id`), but **not parent post caption/message**.

Meta Facebook/Instagram comment webhooks deliver **comment body + IDs**; parent post text is **not** in standard feed/comment webhook payloads. Adapter-level Graph calls today fetch **comment** detail only, not parent **post** message.

**Recommended next PR:** **FPC-2C — Webhook-time safe capture + persist plumbing** (Option A + minimal Graph post fetch at ingest, fail-open). Reland list/DTO read (fixed FPC-2A architecture) only after safe keys exist in DB.

---

## 1. Current data availability

### 1.1 End-to-end data path (inspected)

| Stage | File | What happens for FB/IG comments |
|---|---|---|
| Webhook ingress | `src/interfaces/api/webhook/facebook.ts` | Normalizes via `FacebookAdapter.receiveMessage`; saves raw to `webhook_events.payload_json`; enqueues **outbox** payload **without** `metadataJson` |
| Webhook ingress | `src/interfaces/api/webhook/instagram.ts` | Enqueues outbox **with** `metadataJson` from adapter |
| Adapter normalize | `src/infrastructure/adapters/channels/facebookAdapter.ts` | Extracts **comment** text (`message`, `comment_text`, …); `post_id`, `comment_id`; optional comment attachment URLs + `permalink_url`; optional Graph **comment** fetch |
| Adapter normalize | `src/infrastructure/adapters/channels/instagramAdapter.ts` | Extracts **comment** text (`text`/`message`); `comment_id`, `parent_id`, `media_id` |
| Worker / use case | `src/application/usecases/processInboundMessage.ts` | Persists `messages.content` = comment text; `conversations.provider_post_id` (FB only); **`metadata_json` = `{}` for TEXT comments** |
| List DTO | `src/interfaces/api/inboxDtos.ts` → `buildSourcePostContext` | `post_snippet` from `source_post_snippet` row key or `postContent` (usually null); `lead_comment_snippet` from `last_message_preview` |
| Domain mapper | `src/domain/sourcePostContext.ts` | Safe DTO only; no DB/Graph fetch |

### 1.2 Does stored metadata contain parent post text?

| Channel | Parent post text in DB? | Keys found | Notes |
|---|---|---|---|
| **Facebook TEXT comment** | **No** | `messages.metadata_json` → `{}` | Comment text in `content` only |
| **Facebook IMAGE comment** | **No** (parent) | `{ source, mediaUrl, previewUrl }` | URLs are **comment attachment**, not parent post |
| **Instagram TEXT comment** | **No** | `messages.metadata_json` → `{}` | Adapter emits `commentId`, `mediaId`, … in outbox but use case drops them for TEXT |
| **Instagram DM** | N/A | `{ instagramRecipientId }` | Not comment leads |

**Conclusion:** Production comment rows almost certainly have **`{}` or minimal metadata** — not `source_post_snippet` / `post_caption`.

### 1.3 What *is* available today

| Data | Where | Exposed to UI? |
|---|---|---|
| Comment text | `messages.content`, `conversations.last_message_preview` | Yes → `lead_comment_snippet` |
| `post_id` | `conversations.provider_post_id` (Facebook) | **No** (not in list DTO) |
| `comment_id` | `conversations.provider_comment_id` | **No** |
| Comment attachment thumb/full URL | `facebookAdapter.metadataJson` at normalize time | **Lost** — FB webhook outbox omits `metadataJson` |
| `permalink_url` | Adapter metadata + Graph comment detail | **Lost** before persist; blocked from DTO anyway |
| Raw webhook | `webhook_events.payload_json` | Server-side only; retention may purge; **not** list API |

### 1.4 Webhook payload shape (code evidence)

**Facebook feed comment** (`facebookAdapter.test.ts`):

```json
{
  "from": { "id": "…", "name": "…" },
  "post_id": "PAGE_POST_ID",
  "comment_id": "POST_COMMENT_ID",
  "message": "COMMENT TEXT NOT POST TEXT"
}
```

`extractCommentText()` reads `message` / `comment_text` / `text` — all **comment** fields. No parent post `message` field in fixtures or adapter parsing.

**Instagram comment** (`instagramAdapter.iterateCommentEvents`):

- `text` / `message` → comment body  
- `media_id` / `parent_id` → IDs only, no caption

### 1.5 Parent post thumbnail / permalink

| Asset | In webhook? | Persisted? | Safe for DTO? |
|---|---|---|---|
| Parent post thumbnail | Not in standard comment webhook | No | Deferred (FPC-2D+) |
| Comment attachment image | FB: sometimes | FB IMAGE: `media_url` columns only | Comment media ≠ parent post |
| `permalink_url` | FB comment webhook sometimes | No (dropped) | **Blocked** from `source_post_context` (raw URL policy) |

### 1.6 Server-side raw capture

- `webhook_events.payload_json` stores full Meta payload at ingest (`supabaseWebhookEventRepository.ts`).
- Retention purge may redact keys (`supabaseRetentionRawPayloadPurgeRepository.ts`).
- **Backfill candidate (Option B):** raw payload still lacks parent post text for standard comment events; IDs only.

---

## 2. Safe metadata contract proposal

### 2.1 Allowed keys on `messages.metadata_json` (write path)

```ts
{
  source_post_snippet?: string;      // sanitized parent post text, max 140 chars
  source_post_captured_at?: string;  // ISO timestamp
  source_post_source?: "webhook_payload" | "graph_post_fetch" | "admin_backfill";
  // Optional future (separate approval):
  // source_post_thumbnail_url?: string;  // HTTPS only, post media not profile
}
```

### 2.2 Explicitly never store in metadata or DTO

`rawPayload`, `graphCommentDetail`, `permalinkUrl`, `commentId`, `post_id`, `mediaId`, `parent_id`, tokens, PSID/IGSID, `provider_thread_id`, profile URLs, base64, full webhook blobs.

### 2.3 DTO mapping (read path, future)

`buildSourcePostContext` reads only:

- `postContent` ← `source_post_snippet` (conversation row denormalized **or** message metadata via fail-open enricher)
- `leadCommentContent` ← unchanged (`last_message_preview`)
- `open_post_available: false`, `open_post_href: null` until dedicated open-post phase

---

## 3. Cost guardrails

| Risk | Policy |
|---|---|
| Graph API on `GET /api/conversations` | **Forbidden** |
| Live fetch on dashboard load | **Forbidden** |
| Per-refresh message batch join | Avoid; prefer denormalize at ingest **or** fail-open optional enricher |
| Image proxy / storage / base64 | Out of scope |
| Large metadata to frontend | Allowlist keys only; cap snippet 140 chars |

**Preferred:** capture once at webhook/worker ingest → dashboard reads DB only.

---

## 4. PR #205 regression analysis

### 4.1 What PR #205 added

1. `enrichConversationListSourcePostText` on every list request for FB/IG comment/private-reply rows  
2. `findEarliestInboundMetadataByConversationIds` Supabase query  
3. `extractSourcePostTextFromMetadata` imported by `sourcePostContext.ts` (**circular**)

### 4.2 Likely failure modes

| Issue | Evidence | Impact |
|---|---|---|
| **Circular import** | `sourcePostContext.ts` ↔ `sourcePostTextFromMetadata.ts` (imports `sanitizeSourcePostSnippet`) | Production bundle/runtime undefined export risk |
| **Hard fail on enrich error** | Route `try/catch` → 500 for entire list | One bad query kills inbox |
| **Extra list query** | New `messages` IN query per page | Latency + PostgREST edge cases |
| **Query `order("id")` without `id` in select** | `supabaseMessageRepository.findEarliestInboundMetadata…` | Possible PostgREST/SQL error |
| **Empty metadata anyway** | TEXT comments persist `{}` | Enrichment no-op; failure unrelated to data |

Vercel logs showed 500s without stack traces; root cause **not proven in logs**, but architecture was unsafe.

### 4.3 Reland architecture (required)

```
sourcePostSnippetSanitize.ts   ← pure helpers (no domain imports)
sourcePostTextFromMetadata.ts  ← imports sanitize only (one-way)
sourcePostContext.ts           ← may import extractor (one-way)
enrichConversationList…        ← try/catch fail-open; skip if repo method missing
```

- Route: `enriched = await enrich…().catch(() => rows)` or enricher returns original rows on error  
- Add route integration test with mock `messageRepository` throwing  
- Fix select: `id,conversation_id,metadata_json,created_at`  
- **Do not reland read path until `source_post_snippet` is actually written at ingest**

---

## 5. Implementation options

### Option A — Webhook-time safe capture (recommended first)

**Scope:**

1. Fix `facebook.ts` outbox to forward **sanitized** metadata subset (no `rawPayload`).  
2. Update `processInboundMessage` to persist allowlisted keys for **TEXT** FB/IG comments (not only IMAGE).  
3. In `facebookAdapter.receiveMessage`, after `post_id` known: optional Graph `GET /{post-id}?fields=message` **once at webhook** (adapter already calls Graph for comments); sanitize → `source_post_snippet`.  
4. Instagram: Graph `GET /{media-id}?fields=caption` at webhook (background in adapter), same safe key.  
5. Fail-open: missing token / Graph error → persist comment only, no 500.

**Pros:** No list-time fetch; lowest dashboard cost.  
**Cons:** One Graph call per new comment lead (ingest time, not refresh time); rate limits manageable at comment volume.

### Option B — DB backfill from `webhook_events`

Scan `webhook_events.payload_json` for historical comments; extract parent text **only if key exists** in raw JSON.

**Pros:** No new Graph calls for old rows **if** text was ever present.  
**Cons:** Standard Meta payloads **do not** include parent post text → **limited value** for Facebook; Instagram same. Admin script only; sanitize before write.

### Option C — Background Graph enrichment (later phase)

Worker job: `provider_post_id` / `media_id` → fetch post/caption once → write `source_post_snippet`.

**Pros:** Decouples webhook latency; retry/backoff.  
**Cons:** New worker topic, queue ops, still Graph cost (deferred).

### Recommendation

| Phase | Deliverable |
|---|---|
| **FPC-2C (next)** | Option A: plumbing + webhook-time Graph post/caption fetch + persist `source_post_snippet` |
| **FPC-2D** | Option C if ingest-time Graph too slow/unreliable |
| **FPC-2E** | Reland fail-open list enricher **or** denormalize `source_post_snippet` on `conversations` |
| Optional | Option B one-off backfill (low yield) |

---

## 6. Evidence index

### Files inspected

- `src/interfaces/api/webhook/facebook.ts`, `facebook.test.ts`
- `src/interfaces/api/webhook/instagram.ts`
- `src/infrastructure/adapters/channels/facebookAdapter.ts`, `facebookAdapter.test.ts`
- `src/infrastructure/adapters/channels/instagramAdapter.ts`
- `src/application/usecases/processInboundMessage.ts`, `processInboundMessage.test.ts`
- `src/domain/sourcePostContext.ts`, `src/interfaces/api/inboxDtos.ts`
- `src/infrastructure/adapters/repositories/supabaseConversationRepository.ts`
- `src/infrastructure/adapters/repositories/supabaseWebhookEventRepository.ts`
- PR #205 / #206 diff (reverted enrichment path)

### Key functions

- `FacebookAdapter.extractCommentText`, `receiveMessage` (comment branch)
- `InstagramAdapter.iterateCommentEvents`
- `ProcessInboundMessageUseCase.execute` (metadata persist branch ~L453)
- `buildSourcePostContext`, `toConversationListItemDto`
- `createFacebookWebhookHandler` (outbox payload construction)

### Test fixtures proving shape

- `facebookAdapter.test.ts`: comment `message` is comment text; `post_id` separate
- `facebook.test.ts`: outbox has `facebookPostId`, no `metadataJson`
- `processInboundMessage.test.ts`: FB comment persists with `finalMetadata: {}` for TEXT

---

## 7. Clear next PR proposal

**Title:** `feat(fpc-2c): capture source post snippet at webhook ingest`

**In scope:**

- Sanitized `source_post_snippet` persist on inbound message metadata  
- Facebook webhook `metadataJson` forwarding (sanitized)  
- `processInboundMessage` TEXT comment metadata allowlist  
- Graph post/caption fetch at adapter ingest (fail-open)  
- Unit tests for sanitize + persist; no list route change yet  

**Out of scope:**

- `GET /api/conversations` enrichment reintro  
- Image proxy, open post link, migrations  
- UI changes  

After FPC-2C deploy + backfill smoke, reland **FPC-2A-fixed** read path with fail-open and acyclic imports.
