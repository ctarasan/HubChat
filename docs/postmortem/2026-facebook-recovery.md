# Postmortem: 2026 Facebook Recovery and Hardening

**Status:** Resolved — production healthy (July 2026)

**Impact:** Facebook Comment inbound stopped; Messenger continued; operational health eventually blocked READY promotion.

**Severity:** High (partial channel outage — Comment + Private Reply path)

---

## Timeline (summary)

| Phase | Event |
| --- | --- |
| Pre-incident | HubChat production serving Messenger and Comment via Page webhooks |
| Trigger | Manual operator script POSTed Messenger-only Page `subscribed_fields` |
| Immediate effect | Meta replaced subscription list; **`feed` removed** |
| User-visible | Comments stopped appearing in Dashboard; Private Reply degraded |
| Messenger | Continued working (Messenger fields intact) |
| Detection | Operators noticed missing comments; health check investigation |
| Mitigation | Manual restoration of `feed` subscription (interim) |
| Hardening | PRs #313–#318 shipped over recovery sprint |
| Current state | Messenger PASS, Comment PASS, subscription PASS, Assisted Connection CONNECTED |

---

## Symptoms

| Symptom | Observed |
| --- | --- |
| Facebook Comment inbound | FAIL — no new comments in Dashboard |
| Messenger inbound | PASS — messages still arrived |
| Private Reply | FAIL or degraded — no comment thread to reply to |
| Operational health | FAIL on `PAGE_WEBHOOK_SUBSCRIPTION` (after PR #314 deployed) |
| UI connection state | Could show CONNECTED/READY while Comment path broken (pre-#314) |
| Worker / queue | Healthy — issue was upstream subscription, not processing |
| Meta App Review | Waiting — Default Tenant evidence collection continued |

---

## Investigation

### Hypothesis chain

1. Comment webhooks require Page field `feed` (not `messages`)
2. Check Page `subscribed_apps` → `feed` missing from HubChat app entry
3. Review recent ops actions → manual subscribe script run
4. Script POSTed five Messenger fields only → Meta overwrote full list
5. Automatic OAuth/health paths reviewed → some paths also POSTed without union (pre-#316)

### Evidence

- Graph GET `subscribed_apps`: HubChat app present but `feed` absent
- Vercel webhook logs: no new feed `entry.changes` events after incident window
- Messenger webhook logs: continued 200 accepts
- Code review: `subscribe-default-tenant-facebook-page.mjs` pre-#318 used Messenger-only POST
- Code review: production OAuth/health called subscribe without read-before-write union (pre-#316)

---

## Root cause

**Primary:** Destructive Page webhook subscription write.

Meta Graph API `POST /{page-id}/subscribed_apps` sets the **`subscribed_fields` list for that app on that Page**. POSTing only Messenger fields **replaced** the prior list and **removed `feed`**, silently disabling Comment webhooks.

**Contributing factors:**

1. Manual ops script lacked dry-run default and GET-before-POST guard
2. Automatic subscribe paths did not union with existing fields (pre-#316)
3. READY promotion did not require verified Page subscription (pre-#314)
4. Messenger and Comment share a callback URL but depend on different subscription fields — asymmetric failure mode was not obvious in monitoring

**Not root cause:**

- Worker or queue failure
- OAuth token expiry
- Webhook signature verification
- Dashboard UI bug (though PR #313 fixed unrelated hidden-lead visibility issue discovered during sprint)

---

## Recovery actions

1. Restored `feed` on affected Page via Graph subscription repair
2. Verified Comment inbound via smoke test
3. Shipped hardening PRs (#313–#318)
4. Re-ran full health + smoke verification on production
5. Confirmed Assisted Connection CONNECTED and App Review Default Tenant healthy

---

## PR #313–#318 summary

| PR | Title | Role in recovery |
| --- | --- | --- |
| [#313](https://github.com/ctarasan/HubChat/pull/313) | Hidden Lead / Inbox localStorage v2 | Fixed inbox visibility after purge (conversation ID keyed hidden map); not webhook root cause |
| [#314](https://github.com/ctarasan/HubChat/pull/314) | Webhook subscription verification | `PAGE_WEBHOOK_SUBSCRIPTION` health check; READY blocked without verified Messenger + `feed` |
| [#315](https://github.com/ctarasan/HubChat/pull/315) | Railway typecheck repair | CI hygiene during sprint; no runtime change |
| [#316](https://github.com/ctarasan/HubChat/pull/316) | Preserve feed (union) | GET → union → POST → GET verify on OAuth complete and health repair |
| [#317](https://github.com/ctarasan/HubChat/pull/317) | Stale reconnect UI fix | Clears false NEEDS_RECONNECT during active AUTHORIZING OAuth |
| [#318](https://github.com/ctarasan/HubChat/pull/318) | Manual ops script hardening | Dry-run default, target guards, same union helper, token redaction |

---

## Lessons learned

### What went well

- Messenger path isolation helped narrow blast radius
- Health check framework existed — extension point for subscription verification was clear
- Union algorithm + tests (#316, #318) prevent recurrence on all known write paths
- Assisted Connection provided correct re-subscribe path for operators

### What went wrong

- Destructive Graph API semantics were under-documented for operators
- Manual script was not aligned with production subscribe helper
- Asymmetric failure (Messenger OK, Comment FAIL) delayed root-cause identification
- No automated alert on `feed` field removal specifically

### Prevention (implemented)

| Control | Implementation |
| --- | --- |
| Read-before-write | `subscribeAndVerifyFacebookPageWebhook` always GETs first |
| Union preserve extras | `buildUnionPreservingSubscribedFields` |
| GET failure → no POST | Refuse destructive overwrite when read fails |
| Health gate | READY requires `PAGE_WEBHOOK_SUBSCRIPTION` PASS |
| Ops script dry-run default | No `--apply` = zero POST |
| SmartKorp guard | Script refuses production tenant |
| Token redaction | Ops output sanitized |
| Test coverage | 40+ focused tests on union, verify, ops guards |

### Prevention (recommended future)

- Periodic synthetic Comment smoke in production monitoring
- Alert on health `PAGE_WEBHOOK_SUBSCRIPTION` FAIL
- Operator training: `comments` ≠ `feed`
- Document Graph POST replace semantics prominently (this knowledge pack)

---

## Remaining risks

| Risk | Mitigation | Residual |
| --- | --- | --- |
| Direct Graph API calls outside HubChat | Change control; operator runbook | Medium — human error outside script |
| Meta changes subscription field semantics | Monitor Meta changelog; health check | Low |
| App-level webhook misconfiguration | Manual Meta Console checks | Medium — outside HubChat code |
| App Review not yet approved | Default Tenant smoke + evidence pack | Low for production SmartKorp |
| Multi-tenant Page ID collision | Tenant resolve warnings in webhook handler | Low |

---

## Production status (July 2026)

| Area | Status |
| --- | --- |
| Messenger | PASS |
| Facebook Comment | PASS |
| Webhook subscription | PASS |
| Assisted Connection | CONNECTED |
| Worker | Healthy |
| Queue | Healthy |
| Meta App Review | Waiting |

---

## Related documentation

- [../facebook/README.md](../facebook/README.md) — Facebook Operations Knowledge Pack index
- [../facebook/webhook-subscription.md](../facebook/webhook-subscription.md) — union algorithm and field requirements
- [../facebook/ops-script.md](../facebook/ops-script.md) — hardened manual script
- [../facebook/operator-runbook.md](../facebook/operator-runbook.md) — incident response procedures
