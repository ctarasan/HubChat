# META-FB-POSTAPP-1C Security and Side-Effects Review

## CSRF / OAuth state

- Re-authorize creates a hashed `state` on `oauth_transactions` (`intent=REAUTHORIZE`, `expected_page_id` pinned).
- Callback resolves only via `findActiveByStateHash`; client-supplied tenant/page query is not trusted for binding.
- Authorize URL never includes tokens or codes.

## Authorization

- `POST /api/channel-connect/facebook/reauthorize` requires `ADMIN` via `requireAuth`.
- Non-admin receives 403 (covered by route test).

## Tenant isolation

- Connection lookup is scoped by authenticated `auth.tenantId`.
- Transaction rows carry `tenantId` + `connectionId`; complete/callback paths use those server records.

## Page pinning

- Start stores `expected_page_id` from existing `provider_page_id`.
- `listPages` for REAUTHORIZE filters candidates to the expected Page.
- `complete` rejects mismatch with `PAGE_MISMATCH`, restores `READY`, and does **not** store a new credential.

## Credential preservation

- Start / cancel / Meta deny / token-exchange failure / page mismatch: existing ACCESS_TOKEN is not deleted or deactivated.
- Credential overwrite occurs only after Page match + Page token resolution succeed inside `complete`.
- Failure after overwrite remains the same residual risk as initial connect (documented limitation); mismatch/exchange failures happen before overwrite.

## Stale / duplicate callback

- Expired transactions fail with `INVALID_OR_EXPIRED_STATE` / session expired.
- Active transactions are expired before a new reauthorize start.
- Completed + same selected page returns idempotent success DTO without re-writing credentials.

## Secret redaction

- Public DTOs pass `assertFacebookOAuthPublicDtoSafe`.
- Redirect URLs omit code/state/access_token.
- Operator messages are sanitized; no token/code logging added.

## Side effects intentionally unchanged

- Existing `subscribeAndVerifyFacebookPageWebhook` on successful `complete` remains (union-preserving).
- This PR does **not** add new subscribed_apps POST/DELETE or webhook field set changes.
- No resolver cutover, activation gate, Instagram, or LINE changes.
