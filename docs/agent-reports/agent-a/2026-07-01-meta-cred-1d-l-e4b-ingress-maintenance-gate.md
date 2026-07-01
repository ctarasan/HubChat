# META-CRED-1D-L-E4B-INGRESS — Default-OFF Retry-Safe Ingress Maintenance Gate

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-07-01 |
| Phase | META-CRED-1D-L-E4B-INGRESS (implementation only) |
| Base SHA | `40e92c693052fb582746b9a902151ffe507ab8af` |
| Branch | `feature/meta-cred-1d-l-e4b-ingress-maintenance-gate` |
| Commit SHA | `d787712e7c4e02def6fc5bf74df06075a3417e28` |
| PR | [#306](https://github.com/ctarasan/HubChat/pull/306) |

## Executive summary

Implemented a **default-OFF** Vercel/API ingress maintenance gate behind `HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED` (exact trimmed `"true"` only). When enabled in a future authorized window, blocked **POST** write routes return **503** with stable code `CHAT_INGRESS_MAINTENANCE` and `Retry-After: 60` — no false 200 acknowledgements and no chat-operational mutations.

**Final decision: READY FOR INDEPENDENT REVIEW**

This does **not** authorize Production enablement, deployment, worker pause, webhook gating, or E4B execution.

---

## 1. Route inventory (gated write surfaces)

| Route | Method | Gated? | Notes |
| --- | --- | --- | --- |
| `/api/webhook/facebook` | GET | **NO** | Hub challenge verification unchanged |
| `/api/webhook/facebook` | POST | **YES** | Includes Instagram `object: "instagram"` compatibility path on same URL |
| `/api/webhook/instagram` | GET | **NO** | Hub challenge verification unchanged |
| `/api/webhook/instagram` | POST | **YES** | Canonical Instagram delivery |
| `/api/webhook/line` | POST | **YES** | LINE webhook delivery (empty-events verify path not gated when gate OFF; when gate ON all POST blocked before body read) |
| `/api/messages/send` | POST | **YES** | Authenticated outbound message creation |

### Routes inspected but not gated (no chat-ingress write in scope)

| Route / surface | Reason |
| --- | --- |
| Worker queue consumption (Railway) | Out of scope — separate E4B worker pause |
| `GET /api/ops/runtime` | Read-only |
| Meta activation API | Unchanged — not chat ingress |
| CRM / channel-settings APIs | Not chat-operational ingress writes |

No additional production webhook aliases, legacy paths, or replay/manual ingestion routes were found under `app/api/webhook/`.

---

## 2. Feature flag

| Item | Value |
| --- | --- |
| Name | `HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED` |
| Default | **OFF** |
| Enable semantics | Only exact trimmed lowercase `"true"` |
| Rejects | absent, empty, whitespace, `false`, `TRUE`, `1`, `yes`, `on`, malformed |
| Module | `src/lib/chatIngressMaintenanceFlags.ts` |
| Relationship to resolver/activation flags | **None** |

**Production flag enablement: NONE**

---

## 3. Maintenance response contract

| Field | Value |
| --- | --- |
| HTTP status | **503** |
| Content-Type | `application/json` |
| Body | `{ "code": "CHAT_INGRESS_MAINTENANCE", "error": "Chat ingress is temporarily unavailable." }` |
| `Retry-After` | **60** seconds |
| Payload/body logging | **None** |
| Environment variable names in response | **None** |

Module: `src/lib/chatIngressMaintenanceGate.ts`

---

## 4. Gate placement and behavior

### Webhook POST routes (Facebook, Instagram, LINE)

- Gate evaluated **first** — before `req.text()`, signature verification, JSON parse, `apiBootstrap`, handlers, repositories, queue/outbox.
- **GET** verification routes bypass the gate entirely.

### `POST /api/messages/send`

- **Order:** `requireAuth` → maintenance gate → business logic.
- Unauthenticated callers still receive **401** (maintenance state not leaked).
- Authenticated callers blocked with **503** before `req.json()` parsing and before `apiBootstrap` / outbound writes.

### Default OFF

- All existing route behavior preserved when flag absent/OFF (verified by full regression suite).

---

## 5. Side-effect isolation (gate ON — test evidence)

| Side effect | Blocked? |
| --- | --- |
| Webhook signature verification | **YES** (webhook POST) |
| Handler invocation | **YES** |
| `apiBootstrap` / repositories | **YES** |
| `webhook_events` / queue / outbox writes | **YES** |
| Provider adapters | **YES** |
| Request body logging | **YES** |
| False 200 acknowledgement | **NO** — returns 503 |

---

## 6. Provider retry-safety (documented limitations)

| Provider / surface | Application guarantee | Residual operational risk |
| --- | --- | --- |
| Facebook/Meta webhooks | 503 + `Retry-After`; no DB mutation; no 200 drop | Exact retry duration/backoff governed by Meta — **revalidate operationally before E4B** |
| Instagram webhooks | Same as Facebook (shared Meta signature stack) | Same |
| LINE webhooks | 503 + `Retry-After`; no DB mutation | LINE retry semantics — **revalidate operationally before E4B** |
| Authenticated `/api/messages/send` | 503; no message/outbox enqueue | Client/UI retry behavior varies |

The implementation guarantees **no false successful acknowledgement** and **no chat-operational mutation while blocked**. It does **not** overclaim provider retry windows.

---

## 7. Logging and redaction

Sanitized structured log on block (`chat-ingress-maintenance`):

- `maintenanceGateEnabled`, `routeCategory`, `httpMethod`, `channel`, `responseStatus`
- Optional `requestId` if supplied to gate helper

**Not logged:** bodies, signatures, tokens, secrets, customer identifiers, message content.

---

## 8. Worker isolation

| Check | Result |
| --- | --- |
| Railway worker code changed | **NO** |
| Queue consumption blocked | **NO** |
| Outbound worker behavior changed | **NO** |
| Meta Page resolver wiring changed | **NO** |
| Ingress flag read by worker | **NO** |

Gate applies to **Vercel API ingress routes only**.

---

## 9. Files changed

| File | Change |
| --- | --- |
| `src/lib/chatIngressMaintenanceFlags.ts` | New strict flag parser |
| `src/lib/chatIngressMaintenanceFlags.test.ts` | Flag parser tests |
| `src/lib/chatIngressMaintenanceGate.ts` | Shared gate + 503 response |
| `src/lib/chatIngressMaintenanceGate.test.ts` | Gate contract tests |
| `app/api/webhook/facebook/route.ts` | POST gate wiring |
| `app/api/webhook/instagram/route.ts` | POST gate wiring |
| `app/api/webhook/line/route.ts` | POST gate wiring |
| `app/api/messages/send/route.ts` | Post-auth gate wiring |
| `src/interfaces/api/webhook/facebook.route.test.ts` | Gate ON/OFF route tests |
| `src/interfaces/api/webhook/instagram.route.test.ts` | Gate ON/OFF route tests |
| `src/interfaces/api/webhook/line.route.test.ts` | Gate ON route test |
| `src/interfaces/api/messagesSend.route.test.ts` | Gate ON auth-order tests |
| `docs/agent-reports/agent-a/2026-07-01-meta-cred-1d-l-e4b-ingress-maintenance-gate.md` | This report |

---

## 10. Verification

| Command | Result |
| --- | --- |
| `npm test` | **PASS** — 2550/2550 |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** (at commit time) |
| Hidden/bidi scan | **PASS** |
| Secret/token scan | **PASS** |

### New targeted tests (maintenance)

- Flag parser: absent/empty/whitespace/false/TRUTHY variants/malformed/exact `true`
- Gate response: 503, `Retry-After`, stable code, no env leak
- Facebook: GET unchanged gate ON; POST 503 gate ON before handler
- Instagram: GET unchanged gate ON; POST 503 before signature
- LINE: POST 503 before signature/handler
- Messages send: 503 after auth; 401 for unauthenticated when gate ON

---

## 11. Production actions

| Action | Performed |
| --- | --- |
| Production environment changes | **NONE** |
| `HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED` in Production | **NONE** |
| Vercel / Railway deployment | **NONE** |
| Worker pause | **NO** |
| Live webhook gating | **NO** |
| E4B / purge | **NOT STARTED** |
| Activation replay | **NO** |
| RETRY-5 token accessed | **NO** |

---

## 12. Remaining risks

1. Gate not enabled or operationally validated in Production — implementation only.
2. Provider retry semantics must be revalidated immediately before any authorized E4B window.
3. Railway worker pause remains a **separate** required E4B step.
4. LINE empty-events webhook verify returns 200 when gate OFF; gate ON blocks all LINE POST including verify pings — operational LINE webhook verification during maintenance may require temporary gate OFF (document for E4B runbook).

---

## 13. Final decision

**READY FOR INDEPENDENT REVIEW**

Does **not** authorize E4B execution, Production gate enablement, or deployment.
