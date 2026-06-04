# Agent A Report — CCP-3 Feature-Flagged Worker Outbound Integration

**Date:** 2026-06-04
**Branch:** `feature/ccp-3-feature-flagged-worker-outbound-integration`
**Scope:** Wire CCP-2 `resolveOutboundChannelCredential` into worker outbound adapter resolvers (LINE / FACEBOOK / INSTAGRAM)

## Files changed

| File | Change |
|------|--------|
| `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts` | Worker bridge: Channel Connect → legacy `channel_settings` fallback |
| `src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.test.ts` | Integration tests (flag, modes, providers, security) |
| `src/application/lineOutbound/createLineOutboundAdapterResolver.ts` | Call worker bridge |
| `src/application/facebookOutbound/createFacebookOutboundAdapterResolver.ts` | Call worker bridge |
| `src/application/instagramOutbound/createInstagramOutboundAdapterResolver.ts` | Call worker bridge |
| `src/worker/main.ts` | Instantiate `SupabaseChannelConnectionRepository` only when flag on |
| `src/application/usecases/sendOutboundMessage.lineRuntimeConfig.test.ts` | Worker wiring assertion |
| `docs/agent-reports/agent-a/latest.md` | Index |

## Integration points

1. **`resolveWorkerOutboundWithChannelConnect.ts`** — per-provider helpers:
   - `resolveLineWorkerOutboundConfig`
   - `resolveFacebookWorkerOutboundConfig`
   - `resolveInstagramWorkerOutboundConfig`

2. **`create*OutboundAdapterResolver.ts`** — unchanged adapter construction; only credential resolution path extended.

3. **`worker/main.ts`** — when `isChannelConnectResolverEnabled(process.env)`:
   - creates `SupabaseChannelConnectionRepository`
   - passes `channelConnectionRepository` + `resolverEnabled` into outbound resolvers
   - logs `channelConnectResolverEnabled` (never enables flag in code)

4. **`sendOutboundMessage.ts`** — **not modified** (routing unchanged).

## Feature flag behavior

| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` | `channel_connections` reads | Outbound credentials |
|---------------------------------------------|----------------------------|----------------------|
| unset / `false` | **None** | Legacy `resolve*OutboundConfig` (`channel_settings` + ENV) |
| `true` + `ENV_ONLY` | None | Legacy only |
| `true` + `DB_WITH_ENV_FALLBACK` | Try CCP-1 first | DB if found; else legacy |
| `true` + `DB_ONLY` | CCP-1 only | DB or safe failure |

**This PR does not set the flag in any environment.**

## Per-provider runtime mode (flag on)

Uses existing `HUBCHAT_*_RUNTIME_CONFIG_MODE` values. Channel Connect DB credentials map to existing adapter shapes:

- **LINE:** `channelAccessToken`, `channelSecret`
- **FACEBOOK:** `pageAccessToken`, `graphVersion`, `providerPageId`
- **INSTAGRAM:** `accessToken`, `graphVersion`, `pageId`, optional `businessAccountId`

## Fallback behavior

`DB_WITH_ENV_FALLBACK` + flag on:

1. `resolveOutboundChannelCredential` (CCP-1)
2. On `configSource === DB` with complete secrets → use Channel Connect credentials
3. Otherwise → **legacy** `resolveLineOutboundConfig` / Facebook / Instagram (channel_settings + deployment ENV)

Sanitized logs via `toChannelConnectResolverLogPayload` and `resolutionPath` (`legacy`, `legacy_fallback`, `channel_connect_db`).

## Production safety confirmation

- Default: flag off → **no** `SupabaseChannelConnectionRepository` instance, **no** CCP DB reads
- Existing worker registry ENV adapters unchanged
- Inbound webhooks untouched
- Channel Settings UI/API untouched
- Marketplace untouched
- No package.json changes

## Tests added

`resolveWorkerOutboundWithChannelConnect.test.ts` (17 tests):

- Flag off: no `ChannelConnectionRepository` calls; legacy tokens used
- `ENV_ONLY` + flag on: legacy ENV path only
- `DB_WITH_ENV_FALLBACK`: LINE/FB/IG CCP success; missing/decrypt/key → legacy
- `DB_ONLY`: success + safe failure without secret leakage
- Adapter resolver flag-off guard
- Routing/static regression checks (`sendOutboundMessage`, `mediaPolicy`, `worker/main`)

## Verification

| Command | Result |
|---------|--------|
| `git diff --check` | PASS |
| Hidden/bidi Unicode scan (changed files) | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (1654/1654) |
| `npm run build` | PASS |

## Next recommended PR

**CCP-4 — Feature-flagged inbound webhook integration:** wire `resolveInboundChannelConnection` for connection-specific endpoints (`/api/webhook/line/connections/{publicConnectionKey}`) with the same flag gating and sanitized diagnostics, without changing default global webhook routes.

---

Prior: [CCP-2 resolver foundation](./2026-06-04-ccp-2-db-runtime-resolver-foundation.md)
