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
| Env mutation (Vercel/Railway) | **None** |
| Secrets in this artifact | **None** (status labels only) |

---

## Security guardrail (operator session)

| Check | Result |
|-------|--------|
| Evidence file / repo / docs sanitized | **PASS** — no token, secret, or raw payload values recorded |
| Secret/token paste outside repo/docs | **SECURITY GUARDRAIL FAIL** — raw Railway CLI variable output was accidentally pasted into chat (outside repo/docs) |

Raw CLI variable output was accidentally pasted outside repo/docs; evidence remains sanitized. Decision remains **HOLD** pending credential rotation/remediation.

**Do not** mark **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING** until secret exposure remediation/rotation is completed.

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

**Separate incident:** raw Railway CLI output paste outside repo/docs → **SECURITY GUARDRAIL FAIL** (see above). Remediation/rotation required before flag-on planning.

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
| Secret paste **outside repo/docs** | **Yes** — guardrail fail; rotation pending |

---

## Final decision

**READY FOR CONTROLLED FLAG-ON WINDOW PLANNING WITH SECURITY NOTE** (updated after SEC remediation close)

**Reason:**

- Technical preflight **P1–P7 PASS** on sanitized evidence.
- SEC remediation **DONE**; post-rotation smokes **PASS** — see [`2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md`](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md).
- **Security note:** `HUBCHAT_CREDENTIAL_ENCRYPTION_KEY` **PLANNED ONLY** (not rotated in SEC window).
- **Flag-on execution not approved** — schedule controlled window per checklist §3 only; resolver flag remains **off** until then.

---

## Next steps

1. **Security:** Follow [`2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md`](./2026-06-05-ccp-3-4-sec-credential-exposure-remediation.md) — rotate exposed credentials, run post-rotation smokes, capture §6 evidence row.
2. **Ops:** After SEC close + sanitized re-check, re-evaluate for **READY FOR CONTROLLED FLAG-ON WINDOW PLANNING** (still schedule flag-on only in approved window per checklist §3).
3. Optional: direct HTTP probe of worker `/ready` if public health URL is published.

**Reference:** [`docs/channel-connect-line-outbound-resolver-pilot-checklist.md`](../../channel-connect-line-outbound-resolver-pilot-checklist.md)

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
