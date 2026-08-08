# SmartKorp HubChat — Facebook Operations Knowledge Pack

Operational documentation for diagnosing, recovering, and verifying Facebook connectivity in HubChat production.

**Audience:** engineers, operations, support, incident responders.

**Scope:** Facebook Page OAuth (Assisted Connection), Page webhook subscription, Messenger inbound, Facebook Comment inbound, operational health, and the Default Tenant manual ops script.

**Safety:** This pack contains no tokens, credentials, or secrets. Never paste access tokens into tickets, chat, or runbooks.

---

## Production status reference (July 2026)

| Area | Status |
| --- | --- |
| Messenger inbound | PASS |
| Facebook Comment inbound | PASS |
| Page webhook subscription | PASS |
| Assisted Connection UI | CONNECTED |
| Worker | Healthy |
| Queue | Healthy |
| Meta App Review | Waiting |

---

## Document map

| Document | Purpose |
| --- | --- |
| [architecture.md](./architecture.md) | End-to-end data flow: Meta → webhook → queue → worker → Dashboard |
| [oauth-flow.md](./oauth-flow.md) | OAuth lifecycle, connection statuses, display states, health gating |
| [webhook-subscription.md](./webhook-subscription.md) | Required `subscribed_fields`, GET → Union → POST → GET Verify |
| [health-check.md](./health-check.md) | Six operational health checks including `PAGE_WEBHOOK_SUBSCRIPTION` |
| [messenger-smoke-test.md](./messenger-smoke-test.md) | Messenger inbound/outbound verification |
| [facebook-comment-smoke-test.md](./facebook-comment-smoke-test.md) | Comment and Private Reply verification |
| [assisted-connection.md](./assisted-connection.md) | Assisted Connection operator journey |
| [ops-script.md](./ops-script.md) | Manual Default Tenant subscribe script (dry-run / apply) |
| [operator-runbook.md](./operator-runbook.md) | Decision tree for disconnect, missing messages, recovery |
| [../postmortem/2026-facebook-recovery.md](../postmortem/2026-facebook-recovery.md) | 2026 Facebook Recovery & Hardening incident postmortem |

---

## Related runbooks (existing)

- [HubChat Webhook Smoke Runbook](../hubchat-webhook-smoke-runbook.md) — cross-channel ingress smoke
- [HubChat Facebook OAuth Staging/Pilot Smoke](../hubchat-facebook-oauth-staging-pilot-smoke-runbook.md) — OAuth rollout discipline
- [Channel Settings Runtime Confidence](../hubchat-channel-settings-runtime-confidence-runbook.md) — credential and Test Connection checks
- [Worker Queue Observability](../hubchat-worker-queue-observability-runbook.md) — queue/outbox triage

---

## Key production endpoints

| Endpoint | Role |
| --- | --- |
| `POST /api/webhook/facebook` | Meta Page + Instagram Messaging webhook ingress |
| `POST /api/channel-connect/facebook/health` | Operational health (six checks) |
| `/dashboard/channel-settings` | Assisted Connection UI (Facebook card) |
| `/dashboard/ops` | Queue and runtime observability (ADMIN) |

Canonical production domain: `https://smartkorp-hub-chat.vercel.app`

---

## Recovery hardening PRs (2026)

| PR | Summary |
| --- | --- |
| [#313](https://github.com/ctarasan/HubChat/pull/313) | Hidden Lead / Inbox localStorage fix (v2 key) |
| [#314](https://github.com/ctarasan/HubChat/pull/314) | Page webhook subscription verification gate for READY |
| [#315](https://github.com/ctarasan/HubChat/pull/315) | Railway typecheck repair |
| [#316](https://github.com/ctarasan/HubChat/pull/316) | Preserve `feed` via read-before-write union (automatic paths) |
| [#317](https://github.com/ctarasan/HubChat/pull/317) | Assisted Connection stale reconnect UI fix |
| [#318](https://github.com/ctarasan/HubChat/pull/318) | Manual ops script union-preserving hardening |

See the [postmortem](../postmortem/2026-facebook-recovery.md) for timeline and root cause.
