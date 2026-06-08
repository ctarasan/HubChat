# PROD-CUTOVER-1B - Operator Runbook + Production Cutover Checklist

Operator-facing guide for onboarding **another customer's Facebook Page** and completing
**manual-ready** checks before a controlled production cutover window.

**Production domain:** `https://smartkorp-hub-chat.vercel.app`

**Phase:** PROD-CUTOVER-1B (documentation only - no runtime changes in this deliverable)

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Facebook Page onboarding for a new customer tenant | Marketplace (Shopee / Lazada / TikTok) |
| Channel Settings + webhook + smoke discipline | CDP bridge / Marketing Automation bridge |
| Facebook token/webhook/permission troubleshooting | Backend / API / DB / worker code changes |
| Instagram (IG) avatar UI verification checklist | Migrations or auth/security behavior changes |
| Final production cutover smoke checklist | Permanent `DB_ONLY` cutover |
| | Enabling `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` |

**Safety rules (always):**

1. Never paste Page access tokens, app secrets, verify tokens, JWTs, or raw webhook payloads
   into docs, chat, tickets, or screenshots.
2. Channel Settings secret fields are **write-only** - values must stay blank after save/reload.
3. Record metadata only in evidence: Page ID, tenant id, message/job UUIDs, HTTP status codes,
   diagnostic labels.
4. Approved runtime mode for this phase: **`DB_WITH_ENV_FALLBACK`** per channel - **not**
   permanent `DB_ONLY`.

---

## Prerequisites (before any customer Page work)

| # | Prerequisite | Pass criteria |
|---|--------------|---------------|
| 1 | Production deploy | Vercel + Railway worker on approved `master` SHA (record SHAs only) |
| 2 | Worker healthy | Railway `/ready` -> healthy |
| 3 | Runtime mode | `HUBCHAT_*_RUNTIME_CONFIG_MODE` = **`DB_WITH_ENV_FALLBACK`** (or documented approved value - **not** `DB_ONLY`) |
| 4 | Resolver flag | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **unset or false** |
| 5 | Tenant scope | Target **tenant id** identified; operator has ADMIN access |
| 6 | Meta app | Customer Facebook App + Page admin access (Business Manager) |
| 7 | Ops baseline | `/dashboard/ops` snapshot: outbound/inbound pending, processing, stale, dead-letter |

---

## 1. Facebook Page onboarding - another customer

Use when connecting a **new customer's Facebook Page** to an existing or new HubChat tenant.

### 1.1 Meta permission checklist

Confirm the Facebook App used for HubChat has tokens with at least:

| Permission / capability | Required for | Verify |
|-------------------------|--------------|--------|
| `pages_messaging` | Messenger DM inbound/outbound | App review / token debugger |
| `pages_manage_metadata` | Page metadata reads | Token debugger |
| `pages_read_engagement` | Comment / engagement events (if used) | Token debugger |
| Page role | Admin or sufficient task access on target Page | Business Manager -> Page roles |

For Instagram linked to the same Page, also confirm Instagram product permissions per your Meta
app configuration (DM + comment flows as deployed).

**Do not** record permission grant screenshots that show access tokens.

### 1.2 Collect Page ID and Page access token (secure)

| Item | How to obtain | Store in HubChat |
|------|---------------|------------------|
| **Facebook Page ID** | Meta Business Settings -> Page -> About, or Graph API `me/accounts` (metadata only in notes) | Channel Settings -> Facebook -> **Provider Page ID** |
| **Page access token** | Meta Graph API Explorer / System User token flow (customer-approved) | Channel Settings -> Facebook -> **Page access token** (write-only field) |
| **Page display name** (optional) | Page name from Meta UI | **Provider account name** |

**Never** put token values in email, Slack, or this runbook. Use Channel Settings write-only
fields or approved secret manager injection only.

### 1.3 Channel Settings setup (ADMIN)

Path: `/dashboard/channel-settings`

| Step | Action | Expected |
|------|--------|----------|
| C1 | Open Channel Settings as ADMIN for target tenant | Page loads without 500 |
| C2 | Enable **Facebook** channel | Toggle on |
| C3 | Enter **Provider Page ID** (numeric Page id) | Saves on reload |
| C4 | Enter **Provider account name** (optional label) | Persists after reload |
| C5 | Paste **Page access token** in secret field; Save | Field blank after reload; badge **SET** |
| C6 | Confirm secret badges | Required Facebook credential shows **SET** |
| C7 | Reload page | Non-secret fields persist; secrets remain blank |

Reference:
[`docs/hubchat-channel-settings-runtime-confidence-runbook.md`](hubchat-channel-settings-runtime-confidence-runbook.md)

### 1.4 Test connection

| Step | Action | Expected |
|------|--------|----------|
| T1 | Click **Test connection** for Facebook | HTTP 200; status **READY** or success equivalent |
| T2 | If **NOT_CONFIGURED** | Fix missing Page ID or empty token badge |
| T3 | If **ERROR** | See section 2 Troubleshooting; rotate token if expired |
| T4 | Record safe metadata | `facebookStatus`, `ok: true/false` - no `last_error` body with secrets |

### 1.5 Webhook subscription confirmation (Meta)

Canonical callback: `https://smartkorp-hub-chat.vercel.app/api/webhook/facebook`

| Step | Action | Expected |
|------|--------|----------|
| W1 | Meta App -> Webhooks -> Page object | Callback URL matches canonical domain above |
| W2 | Verify token | Matches deployment verify token env (name only in notes: `FACEBOOK_VERIFY_TOKEN` or app-specific) |
| W3 | Subscriptions | **messages** subscribed (and **feed** / comment-related fields if comment flows required) |
| W4 | Instagram (if same customer) | Instagram product callback per [`docs/hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md) - typically same `/api/webhook/facebook` path for Instagram Login setup |
| W5 | Test from Meta | Webhook test event accepted (Vercel log: 200, no secret in log line) |

Reference: [`docs/hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md)

### 1.6 Inbound / outbound smoke (Facebook Page)

Use a **designated test sender** only.

| Step | Channel path | Expected |
|------|--------------|----------|
| S1 | Send Messenger DM to Page | Vercel `POST /api/webhook/facebook` accepted |
| S2 | Worker | Job processed; no stale processing spike |
| S3 | Dashboard | Conversation appears under correct tenant |
| S4 | Reply from HubChat (Messenger DM) | `delivery_status` **SENT**; `external_message_id` present |
| S5 | Queue | Outbound job terminal **DONE**; `last_error` null |
| S6 | Logs | No Page token, app secret, Bearer, or raw payload in Railway/Vercel snippets |

### 1.7 Comment / private reply smoke (if customer uses comments)

| Step | Action | Expected |
|------|--------|----------|
| R1 | Trigger inbound comment on Page post (test account) | Comment thread appears in Dashboard |
| R2 | Public acknowledgement (if product flow uses it) | Sends only when conversation state allows |
| R3 | Private reply (when eligible) | `SENT`; no false stuck idempotency |
| R4 | Regression | Messenger DM path still works after comment test |

Reference outbound matrix:
[`docs/hubchat-smoke-test-inventory.md`](hubchat-smoke-test-inventory.md) (PROD-D2)

---

## 2. Troubleshooting - Facebook Page token / webhook / permissions

| Symptom | Likely cause | Operator action |
|---------|--------------|-----------------|
| **Test connection failed** (ERROR) | Invalid/expired token; wrong Page ID; app not authorized for Page | Re-issue Page token; confirm Page ID matches token's Page; re-save Channel Settings; re-test |
| **Test connection NOT_CONFIGURED** | Missing Page ID or token not saved | Fill Page ID; save token; confirm **SET** badge |
| **Token expired** | Long-lived token past expiry | Generate new Page access token; update Channel Settings; test connection + outbound smoke |
| **Missing `pages_messaging`** | App lacks permission or Page not granted | Meta App Review / reconnect Page; verify in Access Token Debugger (metadata only) |
| **Webhook not subscribed** | Meta webhook disabled or wrong callback URL | Re-subscribe **messages**; confirm canonical URL; verify token match |
| **Inbound not arriving** | Meta config, Vercel ingress, or wrong Page | Check Vercel route 200; Meta webhook delivery log; confirm Page ID in Channel Settings matches subscribed Page |
| **Outbound failed** | Token revoked, wrong Page token, queue issue | Test connection; Ops Runtime dead-letter delta; worker safe error metadata |
| **Wrong tenant / Page config** | Page ID or token saved under wrong tenant | Verify tenant id in session; compare Page ID field to customer's Page; avoid cross-tenant token reuse |

**Escalation path:**

- Webhook ingress: [`docs/hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md)
- Queue: [`docs/hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md)

---

## 3. Instagram avatar verification checklist

Verify after Instagram inbound is healthy for the customer (or after profile-avatar cache deploy).

| # | Check | How to verify | Pass criteria |
|---|--------|---------------|---------------|
| A1 | API exposes HTTPS profile image URL | Browser devtools -> Network -> `GET /api/conversations` (or list endpoint) for IG thread | Response includes `participant_profile_image_url` or `contact_identity_profile_image_url` as **https://** URL (record hostname only in notes, not full URL if CDN-signed) |
| A2 | Inbox sidebar avatar | Dashboard conversation list for IG contact | Renders profile image **or** initials fallback - not broken empty box |
| A3 | Selected chat header avatar | Open IG conversation | Header shows image **or** initials fallback |
| A4 | Console / network hygiene | Browser console during A2-A3 | No uncaught errors; CDN image failures degrade to fallback (no UI break) |
| A5 | Regression (optional) | Facebook / LINE threads | Existing avatars or initials still render |

**Do not** paste CDN URLs with embedded tokens into tickets. Screenshot with cropped network panel
is acceptable if query strings are redacted.

---

## 4. Final production cutover checklist

Complete before declaring customer cutover **GO**. All sections should **PASS** unless explicitly
deferred and documented.

### 4.1 Configuration readiness

| # | Check | Pass |
|---|--------|------|
| F1 | Channel Settings **LINE** - Test connection **READY** | [ ] |
| F2 | Channel Settings **Facebook** (customer Page) - **READY** | [ ] |
| F3 | Channel Settings **Instagram** - **READY** (if in scope) | [ ] |
| F4 | Runtime mode **`DB_WITH_ENV_FALLBACK`** (not permanent `DB_ONLY`) | [ ] |
| F5 | `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **off** | [ ] |

### 4.2 Ops Runtime

| # | Check | Pass |
|---|--------|------|
| F6 | Outbound queue pending / processing / stale ~ 0 | [ ] |
| F7 | Inbound queue pending / processing / stale ~ 0 | [ ] |
| F8 | Dead-letter delta acceptable vs baseline | [ ] |

### 4.3 Channel smoke

| # | Check | Pass |
|---|--------|------|
| F9 | LINE inbound + outbound text | [ ] |
| F10 | Facebook inbound + Messenger DM outbound | [ ] |
| F11 | Facebook customer Page onboarding smoke (section 1.6-1.7) | [ ] |
| F12 | Instagram inbound + DM outbound (if in scope) | [ ] |
| F13 | Instagram image outbound (if supported for customer) | [ ] |

### 4.4 Security / leakage

| # | Check | Pass |
|---|--------|------|
| F14 | No token/secret in UI after reload | [ ] |
| F15 | No token/secret in Vercel/Railway logs during smoke | [ ] |
| F16 | IG avatar checks (section 3) if Instagram in scope | [ ] |

### 4.5 Cutover decision

| Decision | When |
|----------|------|
| **GO** | F1-F16 pass for agreed scope; ops baseline stable; rollback owner assigned |
| **HOLD** | Any FAIL; fix and re-run affected section |
| **NO-GO** | Secret leak suspected; dead-letter spike; cross-tenant misconfiguration |

Evidence template:
[`docs/hubchat-final-smoke-evidence-template.md`](hubchat-final-smoke-evidence-template.md)

---

## 5. Manual-ready operator sequence (summary)

Recommended order for PROD-CUTOVER-1B:

1. Prerequisites (Prerequisites section)
2. Facebook Page onboarding (section 1.1-1.5)
3. Facebook inbound/outbound + comment smokes (section 1.6-1.7)
4. Instagram avatar verification if IG live (section 3)
5. Full cutover checklist (section 4)
6. GO / HOLD / NO-GO sign-off with sanitized evidence

---

## Related documents

| Document | Use |
|----------|-----|
| [`hubchat-channel-settings-runtime-confidence-runbook.md`](hubchat-channel-settings-runtime-confidence-runbook.md) | Channel Settings discipline |
| [`hubchat-webhook-smoke-runbook.md`](hubchat-webhook-smoke-runbook.md) | Inbound webhook smoke |
| [`hubchat-worker-queue-observability-runbook.md`](hubchat-worker-queue-observability-runbook.md) | Queue/outbox triage |
| [`hubchat-final-go-no-go-runbook.md`](hubchat-final-go-no-go-runbook.md) | Launch gate patterns |
| [`hubchat-smoke-test-inventory.md`](hubchat-smoke-test-inventory.md) | Automated + manual smoke index |

---

## Marketplace / bridges

**Paused** - not part of PROD-CUTOVER-1B.
