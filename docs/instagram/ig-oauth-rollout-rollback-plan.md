# Instagram OAuth — Phased Rollout and Rollback Plan (IG-AUTH-1A)

> **Status:** Architecture plan only. **Not approved for execution.**
> **Base master SHA:** `54f9389494e4038d4e63106c2ceb94ac332fafc2`

---

## Principles

- **No big-bang migration** — every phase is canary-scoped.
- **Legacy path remains** until Phase 10 exit criteria per connection.
- **Rollback** = feature flag OFF + connection `auth_family` revert — no data destruction in early phases.
- Every phase includes: entry criteria, exit criteria, feature flag, telemetry, smoke tests, rollback, data migration notes, no-secret-leak check, operator action.

---

## Feature flags (logical)

| Flag | Purpose |
| --- | --- |
| `HUBCHAT_IG_OAUTH_ENABLED` | Master gate for OAuth routes |
| `HUBCHAT_IG_OAUTH_RESOLVER_ENABLED` | Use `resolveInstagramCredential` for outbound |
| `HUBCHAT_IG_OAUTH_TEST_PARITY` | Test connection uses same resolver |
| `HUBCHAT_IG_OAUTH_REFRESH_ENABLED` | Token maintenance job |
| `HUBCHAT_IG_OAUTH_CONNECTION_ALLOWLIST` | Tenant/connection IDs for canary |
| `HUBCHAT_IG_OAUTH_BLOCK_LEGACY_FALLBACK` | Per-connection fail-closed ENV |

---

## Phase matrix

### Phase 0 — Architecture approval

| | |
| --- | --- |
| **Entry** | IG-AUTH-0/0B merged; IG-AUTH-1A approved |
| **Exit** | Stakeholder sign-off on ADR-1–10; App Review plan acknowledged |
| **Flag** | All OFF |
| **Telemetry** | N/A |
| **Smoke** | N/A |
| **Rollback** | N/A |
| **Data** | None |
| **Secret leak check** | Docs scan only |
| **Operator** | Review architecture pack |

### Phase 1 — Schema/resolver foundation

| | |
| --- | --- |
| **Entry** | Phase 0 exit |
| **Exit** | Migrations applied (additive); resolver stub behind flag; unit tests |
| **Flag** | `HUBCHAT_IG_OAUTH_ENABLED=false` |
| **Telemetry** | `ig_oauth_resolver_invoked` (dry-run mode) |
| **Smoke** | CI only |
| **Rollback** | Revert migration (if not yet prod); flag OFF |
| **Data** | Add columns/metadata; no credential backfill |
| **Secret leak check** | CI secret scan |
| **Operator** | None |

### Phase 2 — OAuth connect in non-production test tenant

| | |
| --- | --- |
| **Entry** | Phase 1 exit; Meta app Instagram Login configured |
| **Exit** | End-to-end connect + token stored encrypted; no production traffic |
| **Flag** | `HUBCHAT_IG_OAUTH_ENABLED=true` (staging only) |
| **Telemetry** | OAuth transaction success/fail counts |
| **Smoke** | Staging connect worksheet; callback error paths |
| **Rollback** | Disable flag; delete test connection rows |
| **Data** | Test tenant connection rows only |
| **Secret leak check** | Network panel: no token in API responses |
| **Operator** | Connect test Instagram account in staging |

### Phase 3 — Read-only identity + test-connection canary

| | |
| --- | --- |
| **Entry** | Phase 2 exit |
| **Exit** | Test connection returns structured status via resolver; no outbound change |
| **Flag** | `HUBCHAT_IG_OAUTH_TEST_PARITY=true` (allowlist) |
| **Telemetry** | Test vs runtime credential source match metric |
| **Smoke** | READY/REAUTH_REQUIRED mapping; MANAGER/SALES still 403 |
| **Rollback** | Flag OFF → legacy test path |
| **Data** | None |
| **Secret leak check** | Test response parser audit |
| **Operator** | Run test connection on canary connection |

### Phase 4 — DM text canary

| | |
| --- | --- |
| **Entry** | Phase 3 exit; `channel_connection_id` on outbound payload |
| **Exit** | Canary DM text success rate ≥ baseline; no cross-connection sends |
| **Flag** | `HUBCHAT_IG_OAUTH_RESOLVER_ENABLED` (allowlist) |
| **Telemetry** | `ig_outbound_send_success`, `connection_binding_ambiguous`, terminal expiry |
| **Smoke** | DM text to test recipient; outside-window terminal unchanged |
| **Rollback** | Flag OFF; legacy Page-token path per connection |
| **Data** | Conversation `channel_connection_id` backfill runbook |
| **Secret leak check** | Worker logs sanitized |
| **Operator** | Monitor canary tenant inbox |

### Phase 5 — DM image canary

| | |
| --- | --- |
| **Entry** | Phase 4 exit (7 days) |
| **Exit** | Image + caption path stable |
| **Flag** | Same allowlist |
| **Telemetry** | Image-specific error codes |
| **Smoke** | JPEG/PNG upload + send |
| **Rollback** | Same as Phase 4 |
| **Data** | None |
| **Secret leak check** | Same |
| **Operator** | Image smoke on canary |

### Phase 6 — Private reply canary

| | |
| --- | --- |
| **Entry** | Phase 5 exit |
| **Exit** | Private reply success; 7-day eligibility unchanged |
| **Flag** | Allowlist |
| **Telemetry** | `ig_private_reply_*` |
| **Smoke** | Comment → private reply |
| **Rollback** | Legacy adapter for private reply |
| **Data** | None |
| **Secret leak check** | Same |
| **Operator** | Comment thread smoke |

### Phase 7 — Source Post + profile canary

| | |
| --- | --- |
| **Entry** | Phase 6 exit |
| **Exit** | Webhook enrichment + worker parity; profile URLs stored |
| **Flag** | Allowlist + enrichment resolver |
| **Telemetry** | `source_post_graph_miss`, profile fetch empty rate |
| **Smoke** | Comment ingest with media; avatar display |
| **Rollback** | Passthrough-only (no Graph enrichment regression) |
| **Data** | None |
| **Secret leak check** | Same |
| **Operator** | Verify conversation metadata |

### Phase 8 — Refresh/re-auth monitoring window

| | |
| --- | --- |
| **Entry** | Phase 7 exit |
| **Exit** | 14-day window: refresh success ≥ target; `REAUTH_REQUIRED` fires correctly on forced expiry test |
| **Flag** | `HUBCHAT_IG_OAUTH_REFRESH_ENABLED=true` (allowlist) |
| **Telemetry** | `ig_token_refresh_success`, `ig_token_refresh_terminal` |
| **Smoke** | Simulated near-expiry refresh in staging |
| **Rollback** | Pause refresh job |
| **Data** | None |
| **Secret leak check** | Refresh logs |
| **Operator** | Watch re-auth banners |

### Phase 9 — Controlled tenant migration

| | |
| --- | --- |
| **Entry** | Phase 8 exit; operator comms sent |
| **Exit** | Pilot tenants on OAuth; legacy manual path still available for opt-out tenants |
| **Flag** | Expand allowlist per tenant |
| **Telemetry** | Per-tenant success dashboards |
| **Smoke** | Full IG-AUTH-0 smoke suite per tenant |
| **Rollback** | Per-tenant allowlist removal |
| **Data** | Migrate manual → OAuth per operator schedule |
| **Secret leak check** | Per-tenant audit |
| **Operator** | Guided reconnect per tenant |

### Phase 10 — Disable legacy fallback (migrated connections)

| | |
| --- | --- |
| **Entry** | Phase 9 exit for connection |
| **Exit** | `HUBCHAT_IG_OAUTH_BLOCK_LEGACY_FALLBACK=true`; ENV not used for OAuth connections |
| **Flag** | Block legacy per connection |
| **Telemetry** | `ig_legacy_fallback_blocked` (should be zero) |
| **Smoke** | Expire ENV token — OAuth connection still works |
| **Rollback** | Re-enable legacy mode flag per connection |
| **Data** | Mark `auth_family=INSTAGRAM_USER_OAUTH` final |
| **Secret leak check** | Same |
| **Operator** | Confirm READY without ENV |

### Phase 11 — Retire legacy path

| | |
| --- | --- |
| **Entry** | All tenants migrated OR evidence window complete (90 days) |
| **Exit** | Remove Page-token adapter path; manual secret UI collapsed |
| **Flag** | Remove legacy flags |
| **Telemetry** | Zero legacy sends for 30 days |
| **Smoke** | Full regression |
| **Rollback** | **Emergency only** — re-enable legacy flag + hotfix branch |
| **Data** | Archive legacy credential rows |
| **Secret leak check** | Final audit |
| **Operator** | Deprecation notice |

---

## Rollback strategy summary

| Level | Trigger | Action |
| --- | --- | --- |
| **L1 — Flag** | Canary error rate spike | Remove tenant from allowlist |
| **L2 — Connection** | Wrong credential binding | Set connection `auth_family=LEGACY_PAGE_TOKEN`; re-enable ENV if needed |
| **L3 — Phase** | Phase exit criteria failed | Revert phase flag globally |
| **L4 — Emergency** | Production outage | Master `HUBCHAT_IG_OAUTH_ENABLED=false`; all traffic on legacy path |

**Data safety:** Rollback does not delete encrypted credentials in L1–L3; operators may need to re-test connections.

---

## Telemetry minimum set

```text
ig_oauth_connect_started
ig_oauth_connect_completed
ig_oauth_connect_failed
ig_outbound_resolver_source          # OAUTH_DB | LEGACY_DB | LEGACY_ENV
ig_outbound_connection_binding_miss
ig_outbound_token_expired_terminal
ig_token_refresh_success
ig_token_refresh_failed
ig_test_connection_status            # structured status enum
```

---

## Operator actions by phase

| Phase | Operator action |
| --- | --- |
| 0 | Read ADR pack |
| 2 | Connect staging account via OAuth |
| 3 | Verify test connection matches runtime |
| 4–7 | Monitor canary conversations |
| 8 | Respond to re-auth banners |
| 9 | Schedule per-tenant migration |
| 10 | Confirm ENV independence |
| 11 | Remove manual tokens from runbooks |

---

## No-secret-leak checklist (every phase)

- [ ] API responses: no `access_token`, `Bearer`, raw Graph payloads
- [ ] Worker logs: sanitized provider errors only
- [ ] OAuth callback redirects: no token in query string
- [ ] `git diff` secret scan in CI
- [ ] Operator docs use placeholders (`EA…`, `IGA…`)
