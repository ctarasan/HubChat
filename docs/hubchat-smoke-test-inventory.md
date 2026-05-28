# HubChat smoke test inventory

Permanent Playwright specs and run guidance for SmartKorp HubChat. Use with `playwright.config.ts`, `.env.e2e.local` (gitignored), and `SKILL.md` (HubChat Testing Strategy).

**Never commit credentials.** Report env var **names** only in CI/chat output.

Webhook operator runbook: `docs/hubchat-webhook-smoke-runbook.md`

Worker/queue observability runbook: `docs/hubchat-worker-queue-observability-runbook.md`

---

## Outbound reliability smoke (PROD-D2)

Controlled outbound reliability smoke is opt-in and does not run by default.

### Coverage matrix

| Outbound path | Type | Expected result | Verification focus |
|---------------|------|-----------------|--------------------|
| LINE outbound text | Controlled mutation | `SENT` | Queue job terminal, no unexpected dead-letter increase |
| Facebook Messenger DM outbound text | Controlled mutation | `SENT` | Queue job terminal, provider response accepted |
| Facebook comment-origin flow (public acknowledgement + private reply path when safe) | Controlled mutation | `SENT` when route is eligible | No false DONE; route behavior matches conversation state |
| Instagram DM outbound text | Controlled mutation | `SENT` | Queue job terminal, no stale processing |
| Instagram DM outbound image | Controlled mutation | `SENT` | Image send terminal with normal queue/outbox drain |
| Instagram outbound PDF | Negative validation | Terminal `FAILED` before provider call | Local validation rejects; no provider send attempt |

### Ops Runtime baseline checks (before/after)

Capture `/dashboard/ops` or `GET /api/ops/runtime` before and after smoke:

- Queue (inbound/outbound): `pending`, `processing`, `stale processing`, `dead letter`
- Outbox: `pending`, `processing`, `stale processing`, `dead letter`
- Current known baseline:
  - inbound queue dead letter: `6`
  - outbound queue dead letter: `19`
  - pending: `0`
  - processing: `0`
  - stale processing: `0`

### Pass/fail criteria

- Success-case sends reach terminal `SENT`.
- Negative validation/provider cases reach expected terminal `FAILED`.
- Retryable provider failures must not become false `DONE`.
- Queue/outbox pending should clear after worker catch-up.
- Stale processing remains `0`.
- Dead-letter does not increase unexpectedly from baseline.

### Optional automation helper (opt-in only)

- `tests/e2e/outbound-reliability-smoke.spec.ts`
- Hard-gated by `HUBCHAT_ENABLE_OUTBOUND_MUTATION_SMOKE=true`
- Requires explicit test conversation/thread/lead IDs via env vars
- Never runs in default CI unless explicitly enabled

---

## Ops Runtime / worker queue observability (PROD-D1)

| Surface | Coverage |
|---------|----------|
| `GET /api/ops/runtime` | `src/interfaces/api/opsRuntime.route.test.ts` — ADMIN 200, 401/403, additive lifecycle fields, stale/dead-letter health reasons, no secrets in body |
| Health classifier | `src/lib/runtimeStatsSnapshot.test.ts` — PENDING depth/lag + stale PROCESSING + dead letter |
| UI parser | `src/ui/opsRuntimeModel.test.ts` — extended fields safe parse |
| E2E (optional env) | `tests/e2e/ops-runtime-smoke.spec.ts` — ADMIN ops page + worker detail test IDs |

**Operator runbook:** `docs/hubchat-worker-queue-observability-runbook.md`

**CI:** covered by `npm test` on every PR.

---

## Webhook regression smoke (PROD-C4, unit tests)

Automated inbound webhook regression coverage lives in `src/interfaces/api/webhook/*.test.ts` (no real Meta/LINE calls; fake IDs/secrets only).

| Route | Test file | Coverage |
|-------|-----------|----------|
| `GET/POST /api/webhook/facebook` | `facebook.route.test.ts`, `facebook.test.ts` | Hub challenge; Meta signature 401; page messenger/comment enqueue; `object: instagram` routed to Instagram pipeline |
| `POST /api/webhook/instagram` (compat) | `instagram.route.test.ts`, `instagram.test.ts` | Signature 401 before bootstrap; FACEBOOK_APP_SECRET compat enqueue; invalid JSON 400 after signature; page-shaped compat payload |
| `POST /api/webhook/line` | `line.route.test.ts`, `line.test.ts` | Signature 401 before JSON parse; invalid payload 400 after signature; valid payload accepted |
| Signature helpers | `webhookSignature.test.ts` | Meta/LINE HMAC verification and secret resolution order |

**Canonical production Instagram callback:** `POST /api/webhook/facebook` (see `docs/hubchat-webhook-smoke-runbook.md`). `/api/webhook/instagram` remains a compatibility route only.

**CI:** covered by `npm test` on every PR.

---

## Smoke test levels

### PR focused checks

Run on every PR or before merge:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

If the PR touches a critical UI/API surface, also run the **related E2E spec only** (not the full suite).

### Post-deploy smoke

Run after **staging deploy**, **production deploy**, **hotfix**, **migration**, or when asked to verify the live app.

Answers:

- Can users log in?
- Does Dashboard load?
- Does `GET /api/conversations` avoid **500**?
- Does the conversation list (or empty state) render?
- Do key pages render?
- Do critical **read-only** UI elements still work?
- Any obvious network/API/browser errors?

**Production:** read-only specs only unless the user explicitly approves mutation tests and a dedicated test tenant is configured.

### Full loop regression

Run before **launch**, before a **major demo**, after **major refactor**, or when the user asks for a **full loop test**.

Includes all permanent specs that apply to the environment (auth/team members on test tenant, dashboard read-only, follow-up mutation on staging, message/channel tests only with safe credentials).

### Launch readiness test

Full loop on **staging/test tenant**, plus manual checklist (migrations applied, worker health, channel credentials, tenant config). Do not use production for mutation or message-send validation.

---

## Permanent E2E spec inventory

Specs live under `tests/e2e/`. Each spec should **skip** with a clear message when required env vars are missing.

### `tests/e2e/auth-team-members.spec.ts`

**Status:** Implemented.

**Coverage:**

- Admin login
- Admin creates Sales login account on test tenant
- Sales login and restricted access behavior
- Manager team member drawer/roster rules
- Navigation regression
- Team Members roster scroll/readability (test E, read-only)

**Mutation risk:**

- Creates a Sales user/member (test A).
- Must use `E2E_TEST_EMAIL_DOMAIN` and test tenant only.
- Production run requires explicit approval and `E2E_ALLOW_PRODUCTION=true`.

**Run:**

```bash
npx playwright test tests/e2e/auth-team-members.spec.ts
```

---

### `tests/e2e/dashboard-sales-smoke.spec.ts`

**Status:** Implemented (read-only).

**Coverage:**

- Login with `E2E_SALES_EMAIL` / `E2E_SALES_PASSWORD`
- Dashboard / Inbox loads for SALES
- `GET /api/conversations` does not return **500** (expects `scope=mine`)
- SALES scope hint; no Team / Ops / Channel Settings nav
- `/dashboard/channel-settings` shows access denied (no channel-settings API GET)
- Conversation list or empty state; optional thread select
- Composer ownership: enabled when assigned, or disabled with ownership hint
- No message send or conversation PATCH mutations during the run

**Mutation risk:** Read-only. Safe for staging/production read-only smoke when credentials are dedicated test accounts.

**Run:**

```bash
npx playwright test tests/e2e/dashboard-sales-smoke.spec.ts
```

---

### `tests/e2e/dashboard-smoke.spec.ts`

**Status:** Implemented (read-only).

**Coverage:**

- Login (Admin or Manager credentials)
- Dashboard loads
- `GET /api/conversations` does not return **500**
- Conversation list or empty state renders
- If a conversation row exists: select first row; chat header and composer render
- Inbox/status filter controls visible (role-dependent)
- Inbox urgency badges may render (read-only; no assertion failure if none)
- No follow-up **edit** UI (Phase II-C2-D read-only)
- No `PATCH /api/conversations/*/follow-up` during the run

**Does not:** send messages, update status, assign/reassign, or PATCH follow-up.

**Mutation risk:** Read-only. Safe for production smoke when `E2E_ALLOW_PRODUCTION=true` is set and user approves read-only production checks.

**Run:**

```bash
npx playwright test tests/e2e/dashboard-smoke.spec.ts
```

---

### `tests/e2e/follow-up-smoke.spec.ts`

**Status:** Implemented (mutation - staging / E2E tenant only).

**Coverage:**

- Manager or Admin login
- Select conversation; Actions -> Set follow-up with date/note
- `PATCH /api/conversations/*/follow-up` succeeds
- Follow-up header line and badge after save; persists after Reload
- Clear follow-up; cleared state after Reload
- SALES on unassigned/wrong-assignee thread: no follow-up action in Actions menu

**Mutation risk:** Mutates follow-up on the first inbox row. **Staging/test tenant only** unless explicitly approved.

**Run:**

```bash
npx playwright test tests/e2e/follow-up-smoke.spec.ts
```

---

### `tests/e2e/message-compose-smoke.spec.ts`

**Status:** Implemented (read-only).

**Coverage:**

- Manager/Admin login
- Dashboard inbox shell + `GET /api/conversations` non-500 guard
- Empty inbox graceful path
- If conversation exists: select row, chat header + composer shell render
- Message textarea, send button, and attachment control visibility
- File input accept hints include image types + PDF
- Ownership/capability state acceptable (enabled send, ownership hint, or Instagram PDF limitation hint)
- No message send, follow-up, assignment, status, or lead-status mutations

**Mutation risk:** Read-only. No send action in this spec.

**Run:**

```bash
npx playwright test tests/e2e/message-compose-smoke.spec.ts
```

---

### `tests/e2e/dashboard-responsive-smoke.spec.ts`

**Status:** Implemented (read-only).

**When to run:** Before production launch and after Dashboard UI/layout changes.

**Coverage:**

- Manager/Admin login
- Dashboard shell on desktop (1280x720), tablet (768x1024), and mobile (390x844) viewports
- `GET /api/conversations` non-500 guard per viewport
- Conversation list remains accessible; empty state or first-row select path
- Chat header and composer shell accessible when a row exists
- No message send, file upload, follow-up, assignment, or status mutations

**Mutation risk:** Read-only. Performs no production mutations.

**Run:**

```bash
npx playwright test tests/e2e/dashboard-responsive-smoke.spec.ts
```

---

### `tests/e2e/dashboard-inbox-regression-smoke.spec.ts`

**Status:** Implemented (read-only).

**When to run:** Before production launch, after inbox stability changes, and after dashboard polling, filter, or selection changes.

**Coverage:**

- Manager/Admin login
- Dashboard shell loads on `/dashboard`
- `GET /api/conversations` non-500 and `ok()` guard
- Reload works without white screen; inbox list row count stable across consecutive reloads
- Empty inbox: `inbox-sidebar-empty` hint (no legacy "No conversations loaded." copy)
- If conversations exist: select first row, chat header, message list, composer shell; selection survives reload
- Optional read-only scope filter click (`inbox-scope-team`) when visible
- No message send, file upload, follow-up, assignment, or status mutations

**Mutation risk:** Read-only. Performs no production mutations.

**Run:**

```bash
npx playwright test tests/e2e/dashboard-inbox-regression-smoke.spec.ts
```

---

### `tests/e2e/messaging-media-regression-smoke.spec.ts`

**Status:** Implemented (read-only).

**When to run:** Before production launch, after composer/media/capability changes, after channel adapter changes, and after Dashboard stability changes.

**Coverage:**

- Manager/Admin login
- Dashboard shell + `GET /api/conversations` non-500 and `ok()` guard
- Empty inbox: `inbox-sidebar-empty` hint (no legacy empty copy)
- If conversations exist: chat header, message list, composer shell, send/attach controls, hidden file input with image/PDF accept hints
- Capability/ownership hints readable when shown (no channel seed required)
- Operator-safe page copy (no stack traces, bearer tokens, or JWT fragments)
- No message send, file upload, follow-up, assignment, or status mutations

**Mutation risk:** Read-only. Performs no production mutations.

**Run:**

```bash
npx playwright test tests/e2e/messaging-media-regression-smoke.spec.ts
```

---

### `tests/e2e/channel-line-smoke.spec.ts`

### `tests/e2e/channel-facebook-smoke.spec.ts`

### `tests/e2e/channel-instagram-smoke.spec.ts`

**Status:** Planned.

**Coverage:** Channel-specific checks only when test channel credentials and safe test recipients exist.

**Mutation risk:** Must not message real customers. Staging/sandbox channels only.

---

### `tests/e2e/outbound-reliability-smoke.spec.ts`

**Status:** Implemented (opt-in controlled mutation; skipped by default).

**Enable conditions:**

- `HUBCHAT_ENABLE_OUTBOUND_MUTATION_SMOKE=true`
- Admin login env vars + explicit safe fixture env vars (no hardcoded customer IDs)

**Coverage:**

- Controlled `POST /api/messages/send` calls for configured safe test fixtures
- Optional `GET /api/ops/runtime` snapshot before/after
- Instagram PDF negative validation guard (`400` expected)
- No secrets/tokens/raw payload error dumping in test output

**Mutation risk:** Sends real outbound messages to configured test fixtures. Development/staging only unless explicitly approved.

**Run:**

```bash
npx playwright test tests/e2e/outbound-reliability-smoke.spec.ts
```

---

## Run matrix

| When | What to run |
|------|-------------|
| Every PR | `typecheck`, `lint`, `npm test`, `build` |
| UI PR (Team Members) | Above + `auth-team-members.spec.ts` (focused `-g` if possible) |
| UI PR (Dashboard/inbox) | Above + `dashboard-smoke.spec.ts` |
| UI PR (follow-up) | Above + `follow-up-smoke.spec.ts` |
| UI PR (composer/attachment) | Above + `message-compose-smoke.spec.ts` |
| UI PR (Dashboard layout/responsive) | Above + `dashboard-responsive-smoke.spec.ts` |
| UI PR (inbox stability / selection) | Above + `dashboard-inbox-regression-smoke.spec.ts` |
| UI PR (composer / media / capability) | Above + `messaging-media-regression-smoke.spec.ts` |
| Webhook route/signature changes | Above + `npm test` (webhook `*.test.ts` under `src/interfaces/api/webhook/`) |
| Outbound reliability checks (controlled mutation) | Above + opt-in `outbound-reliability-smoke.spec.ts` + Ops Runtime before/after baseline comparison |
| After deploy | `dashboard-smoke.spec.ts` + relevant auth/team spec if Team Members or auth changed |
| Major release / schema / worker / channels | Full loop (all applicable specs) |
| Launch | Full loop + `dashboard-responsive-smoke.spec.ts` + `dashboard-inbox-regression-smoke.spec.ts` + `messaging-media-regression-smoke.spec.ts` + manual launch checklist |

---

## Production safety

- **Read-only by default** on production (`dashboard-smoke`, read-only parts of other specs).
- **Mutations** (create user, follow-up PATCH, message send) require **explicit user approval** per run.
- Use a **dedicated test tenant** and disposable test accounts.
- Do **not** send real customer messages.
- Outbound mutation smoke must be explicitly enabled with `HUBCHAT_ENABLE_OUTBOUND_MUTATION_SMOKE=true`.
- Do **not** print secrets, passwords, or tokens.
- Use **`.env.e2e.local`** locally; never commit it.
- **`E2E_ALLOW_PRODUCTION=true`** is required when `E2E_BASE_URL` points at production-like hosts (see `playwright.config.ts`).
- **Prefer staging** for mutation tests and full loop.

### Core env vars (names)

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Deployment origin |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin login |
| `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD` | Manager login |
| `E2E_SALES_EMAIL` / `E2E_SALES_PASSWORD` | Sales login (`dashboard-sales-smoke`) |
| `E2E_ALLOW_PRODUCTION` | `true` to allow production-like host |
| `E2E_TEST_EMAIL_DOMAIN` | Generated Sales emails (auth-team-members) |
| `E2E_NEW_USER_PASSWORD` | Password for created Sales user (auth-team-members) |

See `.env.example` for the full list as the repo evolves.

---

## Coverage gaps (current)

| Area | Spec |
|------|------|
| Auth + Team Members | `auth-team-members.spec.ts` |
| Dashboard / conversations API / composer | `dashboard-smoke.spec.ts` |
| Follow-up PATCH flows | `follow-up-smoke.spec.ts` |
| Message composer + attachment read-only | `message-compose-smoke.spec.ts` |
| Dashboard responsive layout (read-only) | `dashboard-responsive-smoke.spec.ts` |
| Production inbox regression (read-only) | `dashboard-inbox-regression-smoke.spec.ts` |
| Messaging & media regression (read-only) | `messaging-media-regression-smoke.spec.ts` |
| LINE / Facebook / Instagram channel E2E | Planned channel specs |
| Webhook inbound regression (unit) | `src/interfaces/api/webhook/*.test.ts` (PROD-C4) |
| Outbound reliability (controlled mutation) | `tests/e2e/outbound-reliability-smoke.spec.ts` + manual PROD-D2 checklist |

Update this doc when new specs land.
