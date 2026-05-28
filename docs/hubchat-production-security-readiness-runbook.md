# HubChat Production Security / Auth / Runtime Readiness Runbook (PROD-F1)

Final operator and release checklist for production security readiness before launch.

## Canonical production target

- Domain: `https://smartkorp-hub-chat.vercel.app`
- Use production-safe test accounts only.
- Never paste real tokens/secrets in tickets, chat, docs, or screenshots.

## Security baseline goals

1. Role boundaries remain strict (`ADMIN`, `MANAGER`, `SALES`).
2. Tenant scoping is enforced for all business data routes.
3. Setup and privileged routes are closed by default in production.
4. Runtime config modes are explicit and safe by default.
5. API responses/log-safe errors never expose raw secrets or payload internals.

## Auth and role boundary checklist

## `/api/me`

- ADMIN receives own auth context only.
- MANAGER receives own auth context only.
- SALES receives own auth context only.
- Inactive or missing `sales_agents` profile must be blocked (`403`).
- Missing tenant header must be rejected at auth layer.

## ADMIN-only routes

Confirm MANAGER/SALES remain blocked:

- `/api/channel-settings` (GET)
- `/api/channel-settings/[channel]` (PATCH)
- `/api/channel-settings/[channel]/test-connection` (POST)
- `/api/ops/runtime` (GET)

Expected behavior: non-ADMIN must receive `403` (or equivalent forbidden path).

## Tenant scoping checklist

- Tenant ID from auth context is authoritative for repository calls.
- Cross-tenant reads and writes return not found/forbidden (never cross-return data).
- SALES scope remains own-assignment only where applicable.
- MANAGER/ADMIN team views remain tenant-scoped.

## Production setup route safety

Route: `/api/setup/supabase-token`

- Must be disabled by default in production.
- Must require explicit env gate to enable in non-production troubleshooting.
- Disabled response must not include:
  - setup access token values
  - service role names/values
  - credential echoes (username/password content)

If production returns anything except disabled/not found behavior, treat as security incident.

## Runtime config readiness checklist

## Mode expectations

- `ENV_ONLY`: safe default runtime path unless explicitly changed.
- `DB_WITH_ENV_FALLBACK`: allowed for controlled runtime config adoption.
- `DB_ONLY`: not default and not approved for production cutover unless a dedicated later phase explicitly approves it.

## Validation items

- Runtime mode parser defaults to `ENV_ONLY` on unset/invalid values.
- `DB_WITH_ENV_FALLBACK` must fall back safely when DB runtime is unavailable/disabled/error.
- `DB_ONLY` must fail closed if DB runtime is missing (no silent env fallback unless explicitly designed for that mode).
- Error messages must not include secret values.

## Secret and payload safety checklist

Public DTOs and API payloads must not expose:

- `secret_json`
- `access_token`
- `app_secret`
- `verify_token`
- raw `payload_json`
- raw `last_error` content with sensitive material

Use only sanitized summaries and safe metadata for diagnostics.

## Regression guardrails (pre-launch)

- No worker/queue/outbox/provider behavior changes in security hardening phase.
- No migrations for this phase.
- No package/dependency changes for this phase.
- No DB_ONLY runtime cutover in this phase.

## Incident triage shortcuts

If a security/auth check fails:

1. Stop rollout.
2. Capture only safe metadata (route, status code, timestamp, role used, tenant context).
3. Verify whether failure is auth boundary, tenant scope, setup route exposure, or secret leakage.
4. Escalate before any runtime/config changes.

## Related runbooks

- Webhook safety and smoke: `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue observability: `docs/hubchat-worker-queue-observability-runbook.md`
- Channel runtime confidence: `docs/hubchat-channel-settings-runtime-confidence-runbook.md`
