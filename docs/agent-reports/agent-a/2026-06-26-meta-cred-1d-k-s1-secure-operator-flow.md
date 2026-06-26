# META-CRED-1D-K-S1 — Secure Facebook Activation Operator Flow

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-26 |
| Phase | META-CRED-1D-K-S1 (secure operator UI implementation) |
| Authorization | `META-CRED-1D-K-S1 SECURE FACEBOOK ACTIVATION OPERATOR FLOW` |
| Starting master SHA | `e0dfe2ebb6c894831879266061343fda276f3f94` |
| Branch | `feature/meta-cred-1d-k-secure-operator-flow` |
| Commit SHA | `06fe124adbe09533285a4b77badcc705e964e841` |
| PR | _(filled after PR create)_ |

## Executive summary

Adds an ADMIN-only, FACEBOOK-only secure operator activation flow integrated into Channel Settings. Operators can select eligible READY Facebook `channel_connections`, enter a masked Page token, review a fixed activation contract, and submit through the reviewed authenticated fetch path to `POST /api/channel-connect/meta/verify-and-activate` with an in-app `Idempotency-Key`. Includes authenticated disabled-gate preflight (503 `META_ACTIVATION_DISABLED`) using an empty-token probe that cannot reach provider/RPC when the flag is unexpectedly enabled.

**No production execution occurred** — flag unchanged, no real token, no provider calls, no credential writes.

---

## UI location

| Item | Value |
| --- | --- |
| Route | `/dashboard/channel-settings` |
| Surface | `MetaPageCredentialActivationCard` within FACEBOOK Channel Settings card |
| Visibility | Same ADMIN-only gate as Channel Settings (`/api/me` role check) |

---

## Backend routes

| Route | Purpose |
| --- | --- |
| `GET /api/channel-connect/meta/activation-targets` | List tenant-scoped eligible READY FACEBOOK connections (new, read-only) |
| `POST /api/channel-connect/meta/verify-and-activate` | Existing activation API (unchanged semantics) |

---

## Secure token lifecycle

1. Uncontrolled `type="password"` input via `ref` — not stored in React state, localStorage, sessionStorage, URL, or cookies.
2. Token read only at intent creation / submit into in-memory `MetaActivationIntent`.
3. Cleared from input after definitive server response.
4. Never rendered in confirmation, success, or error panels (`assertActivationRenderSafe`).
5. No console logging, analytics, or telemetry hooks in the flow.

---

## Idempotency design

- Generated once per intent via injectable `randomUuid()` (default `crypto.randomUUID()`).
- Sent as `Idempotency-Key` header on activation POST.
- Uncertain transport errors preserve the same intent + key in a `useRef`; explicit replay only after operator confirm.
- Target or token edit invalidates uncertain intent.

---

## Uncertain response behavior

- No automatic retry.
- Form locked while uncertain intent pending in memory.
- Optional explicit replay reuses identical body + idempotency key.
- Cancel clears uncertain intent; no persistence across reload/logout/tenant switch.

---

## Disabled-gate preflight

- UI button posts authenticated probe through `metaActivationFetch` with `buildDisabledGateProbeBody()` (`accessToken: ""`).
- Flag OFF: route returns 503 `META_ACTIVATION_DISABLED` before auth/bootstrap (verified by route tests).
- Flag unexpectedly ON: empty token rejected at body validation (400) before bootstrap/use case — zero provider/encryption/RPC/DB writes (route test added).

---

## Fixed activation contract (UI-enforced)

```json
{
  "accessToken": "<transient operator input>",
  "facebookConnectionId": "<selected eligible connection>",
  "requestedChannels": ["FACEBOOK"],
  "expectedCredentialVersion": 0
}
```

`credentialId` omitted. Instagram / dual-channel not selectable.

---

## Changed files

- `app/api/channel-connect/meta/activation-targets/route.ts`
- `src/application/metaPageCredentialActivation/listFacebookActivationTargets.ts`
- `src/application/metaPageCredentialActivation/listFacebookActivationTargets.test.ts`
- `src/ui/metaPageCredentialActivationUiModel.ts`
- `src/ui/metaPageCredentialActivationUiModel.test.ts`
- `src/ui/MetaPageCredentialActivationCard.tsx`
- `src/ui/MetaPageCredentialActivationCard.test.ts`
- `src/ui/ChannelSettingsPage.tsx`
- `src/ui/channelSettingsPage.test.ts`
- `src/interfaces/api/metaPageCredentialActivationTargets.route.test.ts`
- `src/interfaces/api/metaPageCredentialActivationRoute.test.ts`

---

## Verification

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 2420/2420 PASS |
| `npm run build` | PASS |

---

## Prohibited-action attestation

| Action | Executed |
| --- | --- |
| Production flag enabled | NO |
| Real Facebook token retrieved | NO |
| Meta provider call | NO |
| Production activation API call | NO |
| Production credential write | NO |
| Resolver cutover | NO |
| Migration | NONE |
| Production deploy/merge | NO |

---

## Known limitations

- Authenticated disabled-gate preflight with flag OFF does not exercise `requireAuth` on the activation route (503 returned before auth by design). Operator session is still sent via the reviewed fetch path for consistency.
- Exact replay retains token in browser memory only until cancel/definitive response — not persisted across reload.
- Single-tenant UI; tenant comes from session/`/api/me`, not free-text input.

---

## Decision

**READY FOR AGENT B EXACT-SHA SECURITY REVIEW**
