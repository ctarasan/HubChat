# META-FB-POSTAPP-2C — Sanitized Post-Reauth Evidence Package

**Timestamp Asia/Bangkok:** 2026-08-03 ~09:15 +07:00  
**Agent:** A  
**Mutations:** **NONE**  
**Audience:** Agent B independent review (no DB/API access required)

## FINAL VERDICT

**`PASS — SANITIZED POST-REAUTH EVIDENCE PACKAGE READY FOR AGENT B`**

Package directory: `docs/agent-reports/agent-a/meta-fb-postapp-2c/`

Preserved (not overwritten):

- `docs/agent-reports/agent-a/meta-fb-postapp-2/meta-fb-postapp-2-recovery-report.md`
- `docs/agent-reports/agent-a/meta-fb-postapp-2/meta-fb-postapp-2-success-report.md`

---

## Package contents

| File | Contents |
|---|---|
| `meta-fb-postapp-2c-evidence-report.md` | this report |
| `reauth-attempts.json` | Attempt #1 + #2 full UUIDs + sanitized errors |
| `oauth-transactions.json` | Sanitized REAUTHORIZE rows only |
| `connection-state.json` | READY/CONNECTED + Page + webhook |
| `credential-metadata.json` | ID prefixes / versions / fingerprints only |
| `health-status.json` | last_health_check_at + OK + check names |
| `webhook-subscription-state.json` | webhook_active + complete-path evidence |

---

## Source legend

| Tag | Meaning |
|---|---|
| **Production DB** | Live SELECT via linked Supabase (2026-08-03 re-verify) |
| **Production API** | Prior Agent A GET status capture (2026-07-31); no health POST |
| **Existing Agent A report** | meta-fb-postapp-2 success / recovery / 2A JSON |
| **OPERATOR ATTESTATION** | Operator statement — **not** DB evidence |

---

## 1. Attempt #1 (FAILED)

| Field | Value | Source |
|---|---|---|
| transaction_id | `8f13bf84-9436-4a95-b648-d8d9898b3165` | Production DB |
| intent | REAUTHORIZE | Production DB |
| status | **FAILED** | Production DB |
| expected_page_id | `541846535686129` | Production DB |
| created_at | `2026-07-31 09:12:22.738+00` | Production DB |
| updated_at / completed_at | `2026-07-31 09:16:23.422+00` | Production DB |
| error_category | **ACCESS_DENIED** | Production DB |
| error_code_sanitized | ACCESS_DENIED | Production DB |
| context | Meta 2FA / `two_step_verification`; closed via user_denied | Existing Agent A report |

Secrets not included (tokens, codes, cookies, OAuth state values).

---

## 2. Attempt #2 (COMPLETED)

| Field | Value | Source |
|---|---|---|
| transaction_id | `08f3674a-57a4-4a66-b474-338935219704` | Production DB |
| intent | **REAUTHORIZE** | Production DB |
| status | **COMPLETED** | Production DB |
| expected_page_id | `541846535686129` | Production DB |
| selected_page_id | `541846535686129` | Production DB |
| created_at | `2026-07-31 09:47:29.153+00` | Production DB |
| callback_received_at | `2026-07-31 09:47:41.214+00` | Production DB |
| consumed_at | `2026-07-31 09:47:57.638+00` | Production DB |
| completed_at / updated_at | `2026-07-31 09:47:58.532+00` | Production DB |
| error | **none** (`error_category: null`) | Production DB |
| distinct from #1 | **yes** (different UUID) | Production DB |

---

## 3. OAuth transactions (sanitized)

Exactly **2** REAUTHORIZE rows:

1. FAILED `8f13bf84-…`
2. COMPLETED `08f3674a-…`

Assertions (Production DB, 2026-08-03):

| Check | Result |
|---|---|
| duplicate COMPLETED REAUTHORIZE | **false** (count = 1) |
| PENDING oauth | **0** |
| AUTHORIZING | **0** |

---

## 4. Connection state

| Field | Value | Source |
|---|---|---|
| status | **READY** | Production DB |
| display | **CONNECTED** | Production API (2A GET status) |
| Page | **SMARTKORP** | Production DB |
| Page ID | **541846535686129** | Production DB |
| tenant | `ba82d847…` (SmartKorp) | Production DB (sanitized) |
| webhook_active | **true** | Production DB |
| last_health_check_at | **2026-07-31 09:48:12.255+00** | Production DB |
| AUTHORIZING | **0** | Production DB |
| PENDING | **0** | Production DB |

---

## 5. Credential metadata (sanitized)

| Store | ID prefix | State / version | Page | updated_at | Source |
|---|---|---|---|---|---|
| OAuth `channel_credentials` | `bed72330` | SET / active | via connection → 541846535686129 | **2026-07-31 09:47:55.054+00** | Production DB |
| Meta `meta_page_credentials` | `c536d0ff` | ACTIVE v1 | 541846535686129 | 2026-06-30 (identity stable) | Production DB |
| Binding | `1b86812a` | ACTIVE v1 FACEBOOK | same Page | 2026-06-30 | Production DB |

Fingerprint prefixes only: OAuth `ad389423f6a7` (refreshed on #2); meta-cred `8acbd90355a8` (binding identity).

**No tokens or secrets exported.**

---

## 6. Health

| Field | Value | Source |
|---|---|---|
| last_health_check_at | **09:48:12Z** (`2026-07-31T09:48:12.255Z`) | Production DB |
| healthStatus | **OK** | Production API |
| displayState | CONNECTED | Production API |
| ALL HEALTH CHECKS | **PASS** | OPERATOR ATTESTATION + derived READY/OK invariant |

Capability / check names (all **PASS**):

- CREDENTIAL_RESOLUTION  
- PAGE_ACCESS  
- REQUIRED_TASKS  
- GRAPH_API  
- PAGE_WEBHOOK_SUBSCRIPTION  
- RUNTIME_TEST_CONNECTION  

**POST `/health` was not re-run** for this package.

Per-check rows are **not** persisted in DB; individual PASS entries are labeled `DERIVED_FROM_PERSISTED_READY_OK_INVARIANT + OPERATOR ATTESTATION` in `health-status.json`.

---

## 7. Webhook / subscription

| Field | Value | Source |
|---|---|---|
| webhook_active | **true** | Production DB |
| endpoint | `/api/webhook/facebook` on production host | Production DB |
| complete() subscribeAndVerify | reached on attempt #2 | Existing Agent A audit + COMPLETED tx |
| Live Graph `subscribed_apps` payload | **not exported** (token exposure avoidance) | — |
| Manual subscribe / POST | **not performed** | — |

---

## 8. Timeline (Production timestamps)

```
2026-07-31 09:12:22Z  Attempt #1 REAUTHORIZE created
2026-07-31 09:16:23Z  Attempt #1 FAILED / ACCESS_DENIED (Meta 2FA)
        — gap —
2026-07-31 09:47:29Z  Attempt #2 REAUTHORIZE created (OAuth started)
2026-07-31 09:47:41Z  Attempt #2 callback_received_at
2026-07-31 09:47:55Z  channel_credentials refreshed (fingerprint ad389423f6a7)
2026-07-31 09:47:57Z  Attempt #2 consumed_at / connection connected_at
2026-07-31 09:47:58Z  Attempt #2 COMPLETED → READY
2026-07-31 09:48:12Z  Health last_health_check_at → status OK / CONNECTED
```

---

## 9. Cross-check

| Link | Result |
|---|---|
| Attempt #2 → Page `541846535686129` | PASS (`expected` = `selected`) |
| Connection → same Page + SMARTKORP | PASS |
| Credential refresh after Attempt #2 | PASS (`channel_credentials.updated_at` 09:47:55) |
| Binding → same Page ACTIVE v1 | PASS |
| Health after successful reauth | PASS (09:48:12 after 09:47:57) |
| Webhook active after successful reauth | PASS |
| OAuth pending / AUTHORIZING | PASS (both 0) |
| Duplicate COMPLETED REAUTHORIZE | PASS (only one) |

No inconsistencies detected between live DB re-verify (2026-08-03) and Agent A 2A evidence.

---

## 10. Integrity

- New package only under `meta-fb-postapp-2c/`
- Recovery + success reports under `meta-fb-postapp-2/` untouched
- Secrets excluded
- OPERATOR ATTESTATION clearly labeled where used

---

**STOP**

Next gate: **Agent B independent review from this sanitized evidence package**  
No messaging smoke / reauth / health mutation until new explicit GO.
