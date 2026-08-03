# META-FB-PROFILE-4 — BAUPA App Review Rejection Analysis

**Timestamp Asia/Bangkok:** 2026-08-03 ~11:35 +07:00  
**Agent:** A  
**Mutations:** **NONE**

## FINAL VERDICT

**`BLOCKED — REJECTION DETAILS UNAVAILABLE`**

BAUPA status **APP REVIEW REJECTED** is operator-attested, but **exact reviewer feedback / rejection reason text was not obtainable** (Meta Dashboard login wall for the agent; no feedback pasted; no prior submission package in repo).

**Next gate (Task 9):** **B — BAUPA rejection reason unclear → need more Meta evidence**

---

## 1. Exact BAUPA rejection (Dashboard RO)

| Item | Result | Source |
|---|---|---|
| Dashboard auth | Not authenticated | META_DASHBOARD_READ_ONLY |
| BAUPA status | **APP REVIEW REJECTED** | OPERATOR_ATTESTATION |
| `pages_messaging` | READY TO PUBLISH | OPERATOR_ATTESTATION |
| Reviewer feedback text | **UNKNOWN** | UNKNOWN |
| Rejection date | **UNKNOWN** | UNKNOWN |
| Requested access level | **UNKNOWN** | UNKNOWN |
| See details UI | Not captured | META_DASHBOARD_READ_ONLY |

No Request / Resubmit / Edit / Save performed.

---

## 2. Previous submission

| Field | Value |
|---|---|
| Identifiable BAUPA submission package | **No** |
| Use case / screencast / attachments | **UNKNOWN** |
| Related approved (2026-07-28) | pages_show_list, pages_manage_metadata, pages_messaging, public_profile — **no BAUPA** |
| Do not conflate | 2026-07-02 `instagram_business_basic` rejection |

---

## 3. What Meta expects (OFFICIAL_META_DOC)

| Requirement | Source |
|---|---|
| App Review for BAUPA | [BAUPA feature reference](https://developers.facebook.com/docs/features-reference/business-asset-user-profile-access/) |
| Business verification (+ possible contracts) | Same |
| Allowed usage: User Fields in business app experience | Same |
| Advanced Access for User Profile API / `profile_pic` | [User Profile API](https://developers.facebook.com/docs/messenger-platform/identity/user-profile/) |
| Screencast per permission/feature + login + data usage | [Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/) |
| Written reasons in submission form | App Review docs |

**INFERENCE (not proven for this rejection):** common failure modes elsewhere include unclear use case or screencast not showing ID/name/picture in-app — **not** asserted as HubChat’s actual reviewer notes.

---

## 4. Previous vs current product

All previous-submission columns are **UNKNOWN**. Current HubChat has real Messenger→Inbox flow and avatar UI, but Production Graph User Profile API returns **100/33**, so live `profile_pic` cannot be shown for the smoke PSID today.

See `resubmission-gap-analysis.json`.

---

## 5. Current product flow (verified)

```
Messenger user → SMARTKORP Page → webhook → PSID
→ fetchMessengerUserProfileFromGraph (name + profile_pic)
→ contact/conversation persistence → Inbox ConversationAvatar
```

| Fact | Status |
|---|---|
| Messaging | Works |
| PSID | Works |
| Name in Inbox | Present (historical/mid-compatible identity) |
| profile_pic | Graph denied; DB empty; initials fallback |
| Avatar UI | Ready |

---

## 6. App Review use case (draft only — not submitted)

HubChat = shared inbox. BAUPA needed to show Messenger customer **name + profile picture** in Inbox for agent identification/distinction.

Not claimed: advertising, surveillance, unrelated enrichment.

Details: `current-product-use-case.json`.

---

## 7. Evidence / demo plan

Storyboard in `resubmission-evidence-plan.md`.  
Critical: capture rejection notes first; ensure demo user can return HTTPS `profile_pic` before filming avatar beat.

---

## 8. Code change needed?

| Assessment | Decision |
|---|---|
| Before BAUPA approval | **A. No code change needed** |
| Eventually | **B. Improve Graph error logging** (no PR now) |
| UI | **D. Already ready** |
| Persistence | Only if Graph returns pic and HubChat still drops it |

Do **not** open a profile_pic PR while Meta access is rejected.

---

## 9. Next gate

**B** → Operator READ-ONLY capture of rejection details (`next-gate-recommendation.md`).  
Then assemble resubmission package under explicit GO.  
**Still no Request/Submit in this report.**

---

## 10. Production safety

Confirmed **no**: OAuth, reauth, credential/webhook/`subscribed_apps` mutation, messaging, DB mutation, migration, code change, PR, deploy, Meta permission request, App Review submission, Dashboard config change.

---

## Deliverables

| File |
|---|
| `meta-fb-profile-4-baupa-rejection-report.md` |
| `rejection-evidence.json` |
| `previous-submission-evidence.json` |
| `meta-requirement-evidence.json` |
| `current-product-use-case.json` |
| `resubmission-gap-analysis.json` |
| `resubmission-evidence-plan.md` |
| `next-gate-recommendation.md` |

**STOP**
