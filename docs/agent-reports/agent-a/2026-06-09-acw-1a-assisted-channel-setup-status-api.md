# Agent Report — ACW-1A Assisted Channel Setup Status API

## Metadata

| Field | Value |
|---|---|
| Agent | A |
| Date | 2026-06-09 |
| Phase | ACW-1A — Assisted Channel Connection Wizard backend/API status foundation |
| Branch | `feature/acw-1a-assisted-channel-setup-status-api` |

## Goal

Expose read-only, operator-safe setup status and guided-setup metadata per channel (LINE, Facebook, Instagram) for the Assisted Channel Connection Wizard UI without changing runtime messaging behavior or exposing secrets.

## API contract

**Route:** `GET /api/channel-connections/setup-status`

**Auth:** `MANAGER`, `ADMIN` (tenant-scoped). `SALES` → `403`.

**Response:** `{ data: ChannelSetupStatusItemDto[] }` — always three entries (`LINE`, `FACEBOOK`, `INSTAGRAM`).

| Field | Description |
|---|---|
| `channel` | `LINE` \| `FACEBOOK` \| `INSTAGRAM` |
| `setupStatus` | `not_configured` \| `configured` \| `ready` \| `needs_attention` \| `disconnected` |
| `connectionLabel` | Human-safe label (never a raw numeric provider id) |
| `credentialsPresent` | Boolean flags per required secret type + `allRequiredPresent` |
| `testConnectionAvailable` | `true` when channel is enabled and required secrets are present (same gate as existing test-connection POST; does not run the check) |
| `webhookCallbackUrl` | Public webhook path or stored HTTPS endpoint — no secrets |
| `missingSetupSteps` | Stable step codes for wizard UI (`ENABLE_CHANNEL`, `SET_ACCESS_TOKEN`, …) |
| `activeConnectionScope` | Active/historical scope summary + `maskedProviderIdentity` only |
| `channelSettingsStatus` | Existing `channel_settings` status when present |
| `connectionPlatformStatus` | CCP `channel_connections.status` when present |
| `enabled`, `lastVerifiedAt`, `safeLastError` | Operator-safe health hints |

### Intentionally not implemented (ACW-1A)

- OAuth / Meta Login / LINE Login flows
- Automatic runtime cutover, resolver flag changes, or `DB_ONLY`
- Profile image / display-name enrichment APIs
- Mutations (PATCH/POST) — use existing Channel Settings APIs
- Running test-connection from this endpoint (UI calls `POST /api/channel-settings/[channel]/test-connection`)

## Data sources

- `channel_settings` via `ChannelSettingRepository.listByTenant`
- `channel_connections` via `ChannelConnectionRepository.listByTenant`
- CCW-1A active connection scope helpers (`buildTenantConnectionScopeContext`)

## Security

- No tokens, secrets, raw PSIDs, profile URLs, or raw provider page/account ids in labels
- Provider identity only as `maskedProviderIdentity` (`5418…len=15` pattern)
- No `providerPageId` / `provider_page_id` response fields

## Production behavior

Read-only HTTP route. Inbound webhooks, outbound worker, and Channel Settings runtime unchanged.

## Tests

- `src/domain/channelSetupStatus.test.ts` — status mapping, leakage guards
- `src/interfaces/api/channelConnectionsSetupStatus.test.ts` — role access, contract, no resolver imports
