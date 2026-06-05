# CCP-3.4 — Production P1–P7 LINE Outbound Resolver Preflight (Sanitized)

**Date/time (UTC):** 2026-06-05T09:36:37Z (preflight capture); Railway P3/P4 operator verification appended same day
**Operator:** Agent A (+ interactive operator Railway verification)
**Mode:** Production preflight only — **not** controlled flag-on window
**Master / deploy SHA:** `3e8ae6ded89a8f588c26835fc9921428dddd0337` (`3e8ae6d`, PR **#179** merged)
**Evidence branch:** `docs/ccp-3-4-production-p1-p7-line-preflight-evidence`

---

## Guardrails confirmation

| Guardrail | Status |
|-----------|--------|
| `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` set to true/1/yes | **Not performed** |
| `--execute` / `--dry-run=false` credential migration | **Not performed** |
| `DB_ONLY` runtime mode | **Not set / not used** |
| Flag-on pilot window | **Not opened** |
| Env mutation during preflight capture | **None** (Agent A session) |
| SEC credential rotation (operator) | **DONE** — see SEC remediation doc |
| Secrets in this artifact | **None** (status labels only) |

---

## Security guardrail (operator session)

| Check | Result |
|-------|--------|
| Evidence file / repo / docs sanitized | **PASS** — no token, secret, or raw payload values recorded |
| Secret/token paste outside repo/docs (incident) | **Occurred** — raw Railway CLI variable output pasted into chat |
| SEC remediation | **DONE** — credentials rotated; old keys **REVOKED** where applicable; R1–R8 **PASS** |
| `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` | **PLANNED ONLY** — separate controlled re-encryption phase; not rotated in SEC window |

Chat paste incident is **remediated**. Repo/docs remain sanitized. **Flag-on execution is not approved.** Current status: **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** only.

---

## P1–P7 results (latest)

| # | Check | Result | Sanitized evidence |
|---|--------|--------|-------------------|
| **P1** | Latest `master` deployed (Vercel + Railway) | **PASS** | GitHub deployments: Vercel **Production** `3e8ae6d` @ `2026-06-04T10:14:52Z`; Railway **SmartKorp Hub Chat / production** `3e8ae6d` @ `2026-06-04T10:14:09Z` (state **success**). Vercel prod **Ready**; canonical domain `https://smartkorp-hub-chat.vercel.app`. |
| **P2** | Railway worker `/ready` healthy | **PASS** | Public worker `/ready` URL not published in repo. **Worker health confirmed indirectly:** P5 legacy outbound smoke end-to-end (queue job **DONE**, message **SENT**, `external_message_id` **present**) within ~2 minutes of send @ `2026-06-05T09:34:45Z`; Railway deploy **success** on `3e8ae6d`; no new outbound **PROCESSING** stall. |
| **P3** | Resolver flag OFF/absent in production | **PASS** | **Vercel Production:** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT** (`vercel env ls production`, names only). **Railway Worker (operator interactive):** `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` **ABSENT** (sanitized operator report; no values recorded). |
| **P4** | `DB_ONLY` not used | **PASS** | **Vercel Production:** no `DB_ONLY`, no resolver flag in env name list. **Railway Worker (operator interactive):** no `DB_ONLY` runtime found. Runtime config modes observed: **DB_WITH_ENV_FALLBACK** only for LINE / Facebook / Instagram (mode labels only; not `DB_ONLY`). |
| **P5** | Legacy LINE outbound smoke (env path) | **PASS** | ADMIN production Dashboard. LINE conversation; sent `LINE resolver preflight test`. Send API **202**; no secret leak in response body. Read-only DB: outbound queue job **DONE**, `delivery_status` **SENT**, `external_message_id` **present**, `last_error` **absent**. |
| **P6** | Channel Settings LINE READY | **PASS** | ADMIN `/dashboard/channel-settings`: Reload **200**; LINE **Test connection** **200**, `lineStatus` **READY**, `ok` **true**, UI **Ready**; secret inputs **write-only** (blank). |
| **P7** | Ops Runtime — no new critical issue after P5 | **PASS** | ADMIN `/dashboard/ops` **Refresh** **PASS**. Post-smoke counts: outbound pending/processing/stale **0**; outbound dead letter **26** (unchanged); outbox dead letter **0**. No new stale PROCESSING or new dead letter from P5 smoke. |

---

## P3 / P4 — env / runtime scan (sanitized)

| Surface | P3 resolver flag | P4 `DB_ONLY` | Runtime modes (labels only) |
|---------|------------------|--------------|------------------------------|
| Vercel Production | **ABSENT** | **not found** | not set in Vercel env name list |
| Railway Worker | **ABSENT** | **not found** | LINE / Facebook / Instagram: **DB_WITH_ENV_FALLBACK** |

No env values, tokens, or secrets recorded in this table.

---

## P5 — smoke verification (sanitized)

| Field | Value |
|-------|--------|
| Smoke text | `LINE resolver preflight test` |
| Send API status | **202** |
| Queue job (smoke window) | **DONE** |
| `delivery_status` | **SENT** |
| `external_message_id` | **present** |
| `last_error` | **absent** |

---

## P7 — ops delta (sanitized)

| Metric | Pre-smoke | Post-smoke |
|--------|-----------|------------|
| Outbound pending | 0 | 0 |
| Outbound processing | 0 | 0 |
| Outbound stale processing | 0 | 0 |
| Outbound dead letter | 26 | 26 (no delta) |
| Outbox dead letter | 0 | 0 |

---

## Secret leak check (artifact)

**PASS** — This evidence file and repo docs contain no LINE token, channel secret, Authorization, Bearer, encrypted blob, webhook signature, or raw payload values.

**Historical incident (remediated):** chat paste of raw Railway CLI output outside repo/docs — see [`2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md`](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md).

---

## Stop conditions

| Condition | Triggered? |
|-----------|------------|
| P3 resolver flag true/1/yes | **No** |
| P4 `DB_ONLY` in production | **No** |
| P5 DONE but not SENT | **No** |
| P5 `external_message_id` empty | **No** |
| P7 new critical issue after smoke | **No** |
| Secret leak in **this artifact** | **No** |
| Secret paste **outside repo/docs** | **Yes** (historical) — **remediated** |

---

## Final decision

**READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** (updated after SEC remediation close)

**Reason:**

- Technical preflight **P1–P7 PASS** on sanitized evidence.
- SEC remediation **DONE**; post-rotation smokes **PASS** — see [`2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md`](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md).
- **Security note:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` **PLANNED ONLY** (not rotated in SEC window).
- **Flag-on execution not approved** — `HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED` must remain **OFF**; do not use **DB_ONLY**; do not run **`--execute`** until scheduled checklist §3 window.
- Schedule controlled flag-on **planning** only; marketplace/Shopee/Lazada/TikTok remain **paused**.

---

## Next steps (planning only — not execution)

1. **Ops:** Schedule controlled flag-on **planning** window per [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md) §3.
2. **Security (separate phase):** Track `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` rotation / re-encryption when approved — not part of this preflight ticket.
3. Optional: direct HTTP probe of worker `/ready` if public health URL is published.

**Do not** enable resolver flag, run credential **`--execute`**, or set **DB_ONLY** outside an approved ops window.

---

## Verification (docs PR)

| Check | Result |
|-------|--------|
| Docs-only diff | PASS |
| `git diff --check` | PASS |
| Hidden/bidi scan | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
