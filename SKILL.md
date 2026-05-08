# HubChat Project Skill

## Project Identity

HubChat is SmartKorp's omnichannel conversation and lead-management platform for Thai businesses, especially ecommerce and marketplace sellers.

The product direction is:

1. Centralize customer conversations from LINE, Facebook, Instagram, and future marketplace channels.
2. Convert conversations into manageable leads.
3. Assign each lead to the right sales agent.
4. Keep the system ready for future SmartKorp CDP integration without implementing active CDP sync yet.

HubChat is a conversation + lead assignment system first. It must not become a full CDP, order-management system, or marketing automation engine unless explicitly requested.

## Current Technical Direction

Use the existing architecture:

```text
Webhook/API -> Supabase/Postgres -> outbox/queue -> worker -> channel adapter -> provider API
```

Core stack:

- Next.js for UI and API routes
- Supabase Postgres/Auth/Storage/Realtime
- Railway worker for asynchronous jobs
- TypeScript / ESM
- Clean architecture layers:
  - `src/domain`: pure business rules, shared domain constants, entities, events, ports
  - `src/application`: use cases and orchestration
  - `src/infrastructure`: provider adapters, repositories, queues, external APIs
  - `src/interfaces`: API routes, webhook controllers, UI-facing handlers
  - `src/worker`: queue/outbox processing runtime

Keep domain/application layers decoupled from infrastructure details. Shared constants used by multiple layers should live in `src/domain`, not inside provider adapters.

## Current Channel Support

Existing channels include:

```text
LINE
FACEBOOK
INSTAGRAM
```

Current expected support:

```text
LINE: text, image, PDF fallback/link behavior as currently implemented
FACEBOOK: Messenger text, image, PDF; Facebook comment/private-reply flow as currently implemented
INSTAGRAM: DM text and JPEG/PNG/WEBP image; no PDF/video/audio/generic files yet
```

Do not change existing LINE/Facebook behavior while adding Instagram or marketplace features.

## High-Priority Roadmap

Follow this order unless explicitly instructed otherwise:

```text
1. Lead Assignment Foundation
2. CDP-ready lead/contact/event structure, without active SmartKorp CDP sync
3. Thai marketplace connector framework
4. Shopee Chat MVP
5. Lazada Chat MVP
6. TikTok Shop Customer Service MVP
7. WeChat/WeCom later only if customer demand exists
8. Active SmartKorp CDP sync later, only when explicitly requested
```

Do not implement Shopee/Lazada/TikTok/WeChat before Lead Assignment and CDP-ready data structure are stable.

Do not implement active SmartKorp CDP sync unless explicitly requested.

## Lead Assignment Rules

Lead Assignment is the next major foundation.

Recommended model:

```text
Lead has one active owner at a time.
New leads start as UNASSIGNED.
Admin/Manager can assign, reassign, unassign, close, and reopen leads.
Sales can see and reply only to leads assigned to themselves.
Backend must enforce owner-only reply; UI-only hiding is not enough.
All assignment changes must be audit-logged.
```

Suggested statuses:

```text
UNASSIGNED
ASSIGNED
IN_PROGRESS
CLOSED
```

Suggested roles:

```text
ADMIN
MANAGER
SALES
VIEWER
```

Minimum acceptance criteria for Lead Assignment:

1. New lead enters `UNASSIGNED`.
2. Admin/Manager can assign lead to a sales user.
3. Sales user sees only assigned leads.
4. Sales user can send messages only to assigned leads.
5. Admin/Manager can see and manage all leads.
6. Reassign updates owner correctly.
7. Assignment audit log records who changed what and when.
8. LINE/Facebook/Instagram existing messaging still works.

## CDP-Ready Structure Rules

Prepare for future SmartKorp CDP integration, but do not send events to CDP yet.

Add or preserve data structures that will make future sync easy:

```text
leads
contact_identities
lead_events
optional future cdp fields such as smartkorp_customer_id, cdp_synced_at, cdp_sync_status
```

Recommended event names:

```text
hubchat.lead.created
hubchat.lead.assigned
hubchat.lead.reassigned
hubchat.lead.closed
hubchat.message.received
hubchat.message.sent
hubchat.message.failed
```

Rules:

- Store useful lead and message metadata as internal events.
- Do not build SmartKorp CDP ingestion client yet.
- Do not build real-time CDP sync worker yet.
- Do not build customer merge/unmerge, segmentation, journey automation, or AI lead scoring yet.
- Keep all CDP fields nullable and non-blocking.

## Marketplace Connector Rules

Before building Shopee/Lazada/TikTok Shop connectors, create a reusable marketplace connector foundation.

Required concepts:

```text
provider_accounts
channel capability matrix
credential/token model
adapter interface
order context model placeholder
rate-limit/error handling pattern
```

Channel order:

```text
Shopee first
Lazada second
TikTok Shop Customer Service third
WeChat/WeCom later
```

Marketplace MVP scope:

1. Connect seller/shop account.
2. Receive buyer chat text.
3. Send text reply.
4. Support image only if provider API and permissions allow it.
5. Map buyer/shop identity to `contact_identities`.
6. Show basic order context when available.
7. Integrate with Lead Assignment and owner-only reply.

Out of scope for marketplace MVP:

```text
stock sync
product management
refund management
logistics management
full order management
CDP sync
AI lead scoring
```

## Channel Capability Rules

Use a channel capability matrix rather than hardcoding media rules everywhere.

Capabilities should cover at least:

```text
text
image
pdf
video
audio
generic file
order_context
comment_reply
private_reply
```

Unsupported media must fail locally with a friendly error before calling provider APIs.

Provider tokens and secrets must never be logged.

## UI/UX Rules

Preserve the existing chat UX unless explicitly asked to change it.

Important UI behavior:

1. Conversation list on the left, chat history on the right, composer at the bottom.
2. Inbound messages on the left, outbound messages on the right.
3. Timestamps and date separators remain visible.
4. Unread badges remain visible.
5. Auto-scroll behavior must remain intact:
   - selecting a lead/conversation scrolls to the latest message
   - clicking the same lead scrolls to latest
   - incoming messages auto-scroll only when user is near the bottom
   - incoming messages must not force-scroll when user is reading older messages
   - sending a message scrolls to latest
6. Do not add a visible outbound channel selector unless explicitly requested; derive channel from the active conversation whenever possible.
7. If the user has no permission to reply, disable composer and show a clear read-only reason.

## Provider Adapter Rules

Provider adapters should:

1. Keep text behavior unchanged when adding media support.
2. Validate channel-specific media capability before provider API call.
3. Require HTTPS URLs for provider-facing media sends.
4. Return clear errors and structured logs.
5. Avoid logging access tokens, app secrets, signed URLs if not needed, or sensitive customer data.
6. Keep provider-specific behavior inside infrastructure adapters.
7. Keep shared business copy/constants in domain modules.

For Instagram DM image sending:

```text
Use direct image payload: message.attachment.payload.url
Do not include is_reusable for direct /messages image URL send.
If image + caption is supported, send image first and caption as a separate text follow-up.
If caption follow-up fails after image success, avoid retrying the whole image message and causing duplicate images.
```

## Database and Migration Rules

Use additive Supabase migrations.

Do not perform destructive schema changes without explicit approval.

Every migration should be:

1. Idempotent where practical.
2. Backward-compatible with existing data.
3. Safe for production data.
4. Accompanied by tests or verification SQL when possible.

When adding new lead/assignment structures, provide a backfill plan for existing conversations.

## Testing and Validation Rules

Before marking work as ready, run the available validation commands:

```bash
npm run lint
npm run build
npm test
```

If a script does not exist on the current branch, report that clearly and run the closest available equivalent, such as:

```bash
npm run typecheck
npm run build
```

For UI-affecting changes, include a manual QA checklist.

For provider/API changes, include tests for:

1. happy path
2. unsupported media/type
3. missing/non-HTTPS URL
4. provider error handling
5. regression that existing channels still behave the same

## Git Workflow Rules

Do not commit or push unless explicitly asked.

Never push directly to `main` or `master` unless explicitly approved.

Preferred workflow:

```bash
git status
npm run lint
npm run build
npm test
git checkout -b feature/<short-name>
git add <specific intended files only>
git commit -m "<clear message>"
git push origin HEAD
```

Never use `git add .` when there are local env files, patch files, screenshots, or test notes.

Do not commit:

```text
.env files
.local files
patch files
one-off debug scripts
screenshots
secrets
tokens
private credentials
```

## Cursor Working Style

When asked to implement a change:

1. Inspect the relevant files first.
2. Make the smallest safe change.
3. Do not refactor unrelated code.
4. Preserve existing behavior unless explicitly asked to change it.
5. Add or update tests.
6. Run validation commands.
7. Return:
   - files changed
   - summary of implementation
   - focused git diff
   - lint/build/test results
   - manual QA checklist if applicable

When asked to review/fix a bug:

1. Identify the root cause.
2. Explain the exact failing path.
3. Provide before/after behavior.
4. Add regression tests.
5. Avoid broad rewrites.

## Documentation Rules

Keep `SKILL.md` concise and stable.

Put long plans in docs, for example:

```text
docs/hubchat-roadmap.md
docs/architecture/lead-assignment.md
docs/architecture/marketplace-connectors.md
```

Do not put the full roadmap or long design notes into this skill file.

Update README only when user-facing setup, environment variables, or supported channel behavior changes.
