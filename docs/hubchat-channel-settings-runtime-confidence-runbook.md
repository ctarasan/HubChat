# HubChat Channel Settings Runtime Confidence Runbook (PROD-D4-A)

Operator-safe checklist for verifying Channel Settings configuration confidence without changing runtime behavior.

## Production target

- Canonical production domain: `https://smartkorp-hub-chat.vercel.app`
- Channel Settings page: `https://smartkorp-hub-chat.vercel.app/dashboard/channel-settings`
- Access expectation: ADMIN-only

## Safety rules

1. Never paste raw secrets/tokens into docs, chat, or reports.
2. Secret inputs are write-only; values must remain blank after save/reload.
3. Do not expose `secret_json`, `payload_json`, or raw `last_error` in screenshots/log snippets.
4. Do not change runtime mode to `DB_ONLY` during PROD-D4-A.

## Per-channel verification (LINE / Facebook / Instagram)

Run the same checklist for each channel row on `/dashboard/channel-settings`.

1. **Channel enabled state**
   - Confirm intended `enabled` state (on/off) matches rollout plan.
2. **SET / EMPTY badges**
   - Confirm required credentials show `SET` when configured.
   - Expected missing credentials should show `EMPTY`.
3. **Secret write-only behavior**
   - Enter/update secret values, save, reload page.
   - Confirm secret fields remain blank (not echoed back).
4. **Test connection**
   - Run `Test connection`.
   - Confirm status is successful/ready for configured channels.
5. **Provider metadata (Facebook/Instagram)**
   - Verify provider metadata fields are present and reasonable:
     - `providerPageId`
     - `providerAccountName`
6. **Reload/save behavior**
   - Save, reload, confirm non-secret settings persist.
   - Confirm secret badge remains `SET` if credentials were saved.
7. **Clear stored secret flow**
   - Use clear-secret action where applicable.
   - Confirm clear confirmation path completes and badge changes to `EMPTY`.
   - Re-set only if part of planned test; never leave production unintentionally deconfigured.

## Runtime confidence checklist

Runtime mode interpretation:

- `ENV_ONLY`
  - Runtime uses environment variables only.
  - DB settings UI can still show stored values, but runtime source is env.
- `DB_WITH_ENV_FALLBACK`
  - Runtime can use DB settings, with env fallback if DB value is missing.
  - This is the approved DB-capable mode for current production confidence checks.
- `DB_ONLY`
  - Not approved in PROD-D4-A unless explicitly planned in a later phase.

## Safe rollout checklist for any future DB_ONLY (not for now)

If a future phase explicitly approves `DB_ONLY`, follow this operator sequence:

1. Snapshot current runtime mode and key channel state.
2. Confirm DB secrets for target channels are `SET`.
3. Confirm `Test connection` is ready/successful for target channels.
4. Run inbound/outbound smoke on approved test accounts.
5. Capture Ops Runtime baseline before/after smoke:
   - pending, processing, stale processing, dead-letter.
6. Rollback path:
   - revert runtime mode to `DB_WITH_ENV_FALLBACK` or `ENV_ONLY` immediately if confidence drops.

## Failure triage

### Test connection = `NOT_CONFIGURED`

- Required credential or metadata missing.
- Check badges (`EMPTY`) and required non-secret fields.
- Save, reload, then re-run test connection.

### Test connection = `ERROR`

- Provider/API check failed.
- Confirm token freshness and correct app/account binding.
- Re-run after credential update and save.

### Token expired

- Typical symptom: previously working channel now fails test connection or outbound.
- Rotate token via approved channel admin flow.
- Save/update in Channel Settings, then re-run test connection and smoke.

### Missing provider page/account metadata

- Facebook/Instagram routing may fail or partially degrade.
- Verify `providerPageId` and `providerAccountName` are populated correctly.

### Save succeeds but runtime still fails

- Confirm runtime mode (`ENV_ONLY` vs `DB_WITH_ENV_FALLBACK`) matches expectation.
- In `ENV_ONLY`, DB updates do not become runtime source.
- Use webhook/worker runbooks to isolate ingress vs processing failure.

### Channel Settings loads but outbound fails

- Verify test connection for the specific channel.
- Check Ops Runtime for queue/outbox anomalies and stale processing.
- Inspect worker/provider logs using safe metadata only.

## Cross-runbook workflow

Use these docs together:

- Webhook ingress confidence:
  - `docs/hubchat-webhook-smoke-runbook.md`
- Worker/queue processing confidence:
  - `docs/hubchat-worker-queue-observability-runbook.md`
- Outbound reliability controlled smoke:
  - `docs/hubchat-smoke-test-inventory.md` (PROD-D2 section)

## Operator sign-off template (safe metadata only)

Record:

- Date/time and operator
- Runtime mode observed (`ENV_ONLY` or `DB_WITH_ENV_FALLBACK`)
- Per-channel status: enabled flag, badge state, test connection result
- Any metadata gaps (`providerPageId`/`providerAccountName`)
- Ops Runtime before/after smoke summary
- Final confidence decision and rollback readiness
