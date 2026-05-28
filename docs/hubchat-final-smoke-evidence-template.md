# HubChat Final Launch Smoke Evidence Template (PROD-G2)

Use this template to record final launch smoke evidence before GO/NO-GO decision.
Record safe metadata only. Never paste secrets, tokens, JWTs, or raw payload bodies.

## 1) Run metadata

- Production domain: `https://smartkorp-hub-chat.vercel.app`
- Test date/time (UTC+offset):
- Tester:
- Roles tested: (ADMIN / MANAGER / SALES)
- Browser/device:

## 2) Deployment evidence

- Vercel deployment URL:
- Vercel commit SHA:
- Railway worker deployment URL or release reference:
- Railway worker commit SHA:
- Supabase migration status: (up to date / pending / blocked)
- Deploy alignment check (Vercel vs Railway commit): (match / approved mismatch / mismatch-no-go)

## 3) Ops baseline

### Before smoke

- Inbound queue pending:
- Inbound queue processing:
- Inbound queue stale processing:
- Inbound queue dead letter:
- Outbound queue pending:
- Outbound queue processing:
- Outbound queue stale processing:
- Outbound queue dead letter:
- Outbox pending:
- Outbox processing:
- Outbox stale processing:
- Outbox dead letter:
- Notes (historical baseline interpretation):

### After smoke

- Inbound queue pending:
- Inbound queue processing:
- Inbound queue stale processing:
- Inbound queue dead letter:
- Outbound queue pending:
- Outbound queue processing:
- Outbound queue stale processing:
- Outbound queue dead letter:
- Outbox pending:
- Outbox processing:
- Outbox stale processing:
- Outbox dead letter:
- Delta from baseline:

## 4) Authentication checks

- ADMIN can access Dashboard / Team / Ops / Channel Settings: (pass/fail)
- MANAGER access behaves as expected: (pass/fail/not-tested)
- SALES access behaves as expected (own scope, restricted nav): (pass/fail/not-tested)
- Inactive or missing `sales_agents` path blocked safely: (pass/fail/not-tested)
- `setup/supabase-token` disabled in production: (pass/fail/not-tested)

## 5) Channel checks

- LINE inbound text: (pass/fail/not-tested)
- LINE outbound text (safe fixture only): (pass/fail/not-tested)
- Facebook inbound: (pass/fail/not-tested)
- Facebook outbound DM (safe fixture only): (pass/fail/not-tested)
- Facebook comment-origin flow: (pass/fail/not-tested)
- Instagram inbound via `/api/webhook/facebook`: (pass/fail/not-tested)
- Instagram outbound text (safe fixture only): (pass/fail/not-tested)
- Instagram outbound image (safe fixture only): (pass/fail/not-tested)
- Instagram PDF local negative validation: (pass/fail/not-tested)

## 6) Dashboard checks

- Conversation list loads without 500: (pass/fail)
- Conversation selection shows chat header/composer/context panel: (pass/fail)
- Unread badge behavior matches operator expectation: (pass/fail/not-tested)
- Actions menu and follow-up editor open/close path: (pass/fail/not-tested)
- Lead / follow-up / SLA filters and active chips: (pass/fail/not-tested)
- Empty/load-failed states operator-safe and useful: (pass/fail/not-tested)

## 7) Channel Settings checks

- Channel Settings page loads for ADMIN: (pass/fail)
- Secret inputs are blank and write-only: (pass/fail)
- Test connection controls exist (LINE/FACEBOOK/INSTAGRAM): (pass/fail)
- Metadata save does not clear secrets: (pass/fail/not-tested)

## 8) Ops Runtime checks

- `/dashboard/ops` loads: (pass/fail)
- Operator guidance visible: (pass/fail)
- Refresh works: (pass/fail)
- Pending/processing/stale are normal before/after smoke: (pass/fail)
- Dead-letter baseline understood as historical unless growth: (pass/fail)

## 9) API/UI leak checks

- API response leak check (no secret/token/JWT/raw payload markers): (pass/fail)
- UI leak check (no stack trace/JWT/Bearer/secret fragments): (pass/fail)
- Log leak check (Vercel/Railway safe metadata only): (pass/fail)

## 10) Final decision

- Final decision: **GO / NO-GO**
- If NO-GO, reason:
- Incident/rollback owner:
- Next checkpoint time:

## 11) Evidence links

- Read-only E2E run links/artifacts:
- Ops Runtime screenshots or exported summaries:
- Vercel logs (safe snippets only):
- Railway logs (safe snippets only):
