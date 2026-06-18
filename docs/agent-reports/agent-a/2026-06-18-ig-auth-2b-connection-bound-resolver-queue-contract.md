# IG-AUTH-2B — Connection-bound Resolver and Queue Contract

> **Agent A implementation report**  
> **Branch:** `feature/ig-auth-2b-connection-bound-resolver-queue-contract`  
> **Base master SHA:** `6a709fbdc26a30bd4c02e275cbd2883cfd7847c5`

---

## Current outbound flow inspected

```text
API send → create_outbound_message_with_outbox RPC
→ outbox_events → outbox relay → queue_jobs (topic: message.outbound.requested)
→ OutboundWorker → SendOutboundMessageUseCase.execute()
→ resolveOutboundAdapter() (tenant-global Instagram resolver today)
→ InstagramAdapter delivery
```

| Item | Location |
| --- | --- |
| Queue payload type | `OutboundMessageRequestedPayload` in `src/domain/events.ts` |
| JSON validation | New: `src/lib/instagramOAuthOutboundQueueContract.ts` (zod) |
| `tenantId` | Queue envelope + payload field |
| `channelConnectionId` | Conversation row (`conversations.channel_connection_id`); not yet in queue payload |
| Legacy Instagram identity | Page token via `resolveInstagramWorkerOutboundConfig` / ENV + `channel_settings` |
| Idempotency key | `${tenantId}:${messageId}` (unchanged) |
| Worker credential path | `createInstagramOutboundAdapterResolver` → CCP resolver with ENV fallback modes |
| Retry/dead-letter | `src/lib/outboundDeliveryError.ts`, `src/worker/outboundWorker.ts` |

---

## Queue contract decision

Additive optional field on `OutboundMessageRequestedPayload`:

```text
instagramCredentialBinding?: InstagramCredentialBinding
```

Contract version `1` embedded in connection-bound binding.

### Connection-bound shape

```text
mode: CONNECTION_BOUND
contractVersion: 1
provider: INSTAGRAM
authFamily: INSTAGRAM_BUSINESS_LOGIN
deliveryPath: DATABASE_ONLY
channelConnectionId: <uuid>
```

### Legacy shape

```text
mode: LEGACY
```

Absent field = legacy behavior (unchanged).

---

## Prohibited queue fields

Rejected at parse time: `accessToken`, `access_token`, `accessTokenCiphertext`, `ciphertext`, `authorizationCode`, `appSecret`, `verifyToken`, `secretFingerprint`, `rawProviderResponse`, `encryptionKey`, `authorizationHeader`.

---

## Resolver contract

`InstagramConnectionCredentialResolver` port in `src/domain/ports.ts`  
Implementation: `createInstagramConnectionCredentialResolver()` in `src/application/instagramOAuth/resolveInstagramConnectionCredential.ts`

Resolves latest credential from `tenantId + channelConnectionId` at execution time (not enqueue snapshot).

---

## Allowed lifecycle statuses

| Status | Policy |
| --- | --- |
| ACTIVE | Resolvable |
| TOKEN_EXPIRING | Resolvable if `tokenExpiresAt` > now |
| REFRESHING | Retryable unavailable |
| PENDING | Configuration not ready |
| REAUTH_REQUIRED | Reauth required |
| REVOKED / DISCONNECTED | Terminal unavailable |
| ERROR | Configuration error |

No Meta refresh API calls in IG-AUTH-2B.

---

## No-fallback invariant

`INSTAGRAM_BUSINESS_LOGIN` + `DATABASE_ONLY` required for connection-bound jobs.  
`ENVIRONMENT_FALLBACK` → `CONFIGURATION_ERROR`.  
Resolver does not read ENV tokens, Page tokens, or tenant-global credentials.

---

## Error taxonomy

`src/lib/instagramOAuthResolverErrors.ts` — sanitized errors with classification: `retryable`, `terminal_configuration`, `reauth_required`, `feature_disabled`.

---

## Tenant isolation

Resolver uses `ChannelConnectionRepository.findById(tenantId, connectionId)` and `InstagramOAuthCredentialRepository` tenant-scoped methods only.

---

## Credential rotation semantics

`findActiveByConnection` + `retrieveDecryptedMaterial` at execute time returns latest `credentialVersion`. Queue binds `channelConnectionId` only — no token snapshot.

---

## Runtime wiring boundary

- **No** changes to `worker/main.ts`, `SendOutboundMessageUseCase`, or Instagram adapter selection
- Resolver gated by `HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED` + `HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED` (both must be `true`)
- Flags default OFF; absent = OFF
- Test asserts worker does not import connection credential resolver

---

## Tests

- `instagramOAuthOutboundQueueContract.test.ts` — legacy/connection-bound parse, prohibited fields, no-fallback
- `resolveInstagramConnectionCredential.test.ts` — resolver policy, tenant isolation, rotation, runtime gate, worker wiring guard

---

## Deferred work

IG-AUTH-2C through IG-AUTH-2I (OAuth routes, adapter cutover, refresh job, rollout).

---

## Scope confirmation

```text
Connection-bound resolver and queue contract foundation only.
No OAuth routes. No Meta token or delivery calls.
No production resolver/adapter cutover.
No worker bootstrap change selecting OAuth.
No Test Connection change. No frontend/UI change.
No environment or production credential change.
No migration execution. No deployment.
```
