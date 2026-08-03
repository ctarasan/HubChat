# META-FB-PROFILE-5 — BAUPA Resubmission Preparation

**Timestamp Asia/Bangkok:** 2026-08-03 ~12:15 +07:00  
**Agent:** A  
**Mutations:** **NONE** (prepare only)

## FINAL STATUS

**`PASS — RESUBMISSION PACKAGE READY FOR RECORDING`**

| | |
|---|---|
| PACKAGE READY | **YES** |
| SCREENcast RECORDED | **NO** |
| BAUPA REQUESTED | **NO** |
| APP REVIEW SUBMITTED | **NO** |

---

## 1. Root cause — CONFIRMED

| Field | Value |
|---|---|
| Classification | **META REVIEW / EVIDENCE FAILURE** |
| Decision | REJECTED |
| Reason | Screencast Not Aligned with Use Case Details |
| Policy | Developer Policy 1.6 — Build a Trustworthy Product |
| Meta note | Use case **allowed**; screencast failed to demonstrate end-to-end experience |
| Reviewer | Screencast unclear |

**Not** the rejection cause: Graph `100/33`, UI bug, `pages_messaging`, `public_profile`, UNKNOWN reason.

Graph `100/33` remains **supporting technical context only** (Production still cannot load User Profile API while BAUPA is rejected).

---

## 2. Meta requirements → HubChat flow

See `meta-requirement-to-flow-map.json` (A–I): Meta login → grant → Page connect → Messenger inbound → identity → profile lookup → avatar use → Inbox → business value.

---

## 3. Screencast storyboard

See `screencast-storyboard.md` (beats 00–16).

**Critical honesty:** Do not fabricate `profile_pic`. Caption post-approval behavior in the same `ConversationAvatar` slot if live image unavailable.

**Critical architecture:** BAUPA is **not** in HubChat OAuth scope list; show pages_* grant + caption BAUPA Advanced Access for User Profile API.

---

## 4. Recording checklist

See `screencast-checklist.json` (English UI, captions, tooltips, Meta login, grant, E2E, no secrets, architecture disclosure).

---

## 5. Submission notes (draft)

See `app-review-submission-notes.md` — English draft covering product, BAUPA why, `profile_pic` where/how, E2E observer guide, architecture disclosure.

---

## 6. Gap analysis

| Bucket | Highlights |
|---|---|
| CONFIRMED READY | Rejection confirmed, storyboard, notes, architecture, UI ready |
| NEEDS RECORDING | Final video |
| NEEDS PRODUCTION SETUP | Demo user, English session, optional App Role for live pic |
| NEEDS META ACCESS | Advanced Access for reliable Production `profile_pic` |
| UNKNOWN | Whether Standard Access App Role can show pic pre-approval |

**Complete screencast before Request BAUPA again?** **PARTIAL** — full E2E except guaranteed live Production `profile_pic`.

---

## 7. Agent B checklist

See `reviewer-verification-checklist.json` (all items `PENDING_RECORDING` until video exists; package artifacts ready for 5B review now).

---

## 8. Architecture disclosure

| Component | Present |
|---|---|
| User OAuth | **Yes** |
| Page Access Token | **Yes** (encrypted `channel_credentials`) |
| Server-to-server webhook/profile | **Yes** |
| System User token | **No** (not found in inspected Facebook path) |
| Combination | **Yes** |

Details: `architecture-disclosure.json`.

---

## Next gate

**META-FB-PROFILE-5B — Agent B Independent Review**  
Then record screencast → **explicit GO** before Request/Resubmit.

**STOP** — no BAUPA request, no App Review submit, no Dashboard change, no code/PR/deploy.
