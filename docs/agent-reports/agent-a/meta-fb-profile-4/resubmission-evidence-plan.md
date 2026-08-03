# META-FB-PROFILE-4 — BAUPA Resubmission Evidence Plan

**Do not submit App Review in this gate. Do not Request Advanced Access. Storyboard only.**

## Preconditions before filming

1. Operator captures **exact rejection feedback** from Meta Dashboard (screenshot + text) — currently UNKNOWN.
2. Confirm business verification status for App `943662608544465`.
3. Identify an **App Role / tester** Messenger user that can be used under Standard Access (if any) so reviewers can see profile fields before Advanced Access is granted.
4. Do **not** rely on Production smoke customers alone if Graph still returns `100/33`.

## Screencast storyboard (official Screen Recordings alignment)

| Beat | Show on screen | Why (OFFICIAL_META_DOC) |
|---|---|---|
| 1 | Logged-out HubChat → login as agent | Complete login flow |
| 2 | Channels / Facebook connection for SMARTKORP = CONNECTED | Context of business asset (Page) |
| 3 | Messenger (mobile/web) customer sends a short message to SMARTKORP Page | User engaging with business asset |
| 4 | HubChat Inbox: conversation appears with customer **name** | Data usage of name field |
| 5 | HubChat Inbox: customer **profile picture** visible (not initials-only) | Data usage of picture / profile_pic |
| 6 | Open conversation header; avatar still visible next to thread | Persistent in-app use |
| 7 | Optional: briefly show that locale/gender are **not** collected for this flow | Scope limitation |
| 8 | Optional end card: “Profile fields used only for Inbox identification by tenant agents” | Allowed usage framing |

### Annotations (recommended)

- Highlight avatar when it loads.
- Caption: “Messenger User Profile → Inbox avatar”.
- Do **not** claim advertising/surveillance uses.

## Written form draft concepts (not submitted)

**Use case (short):**  
HubChat is a shared customer inbox. For Facebook Messenger conversations on a connected Page, HubChat retrieves the Messenger user’s name and profile picture so support agents can visually identify the customer in the conversation list and message view.

**Why necessary:**  
Without avatars, agents rely on initials/names alone and can confuse customers with similar names during high-volume support.

**Data handling (to complete before submit):**  
- Stored on tenant-scoped contact/conversation records  
- Visible to authenticated tenant users only  
- Retention/deletion: **fill from actual privacy policy** (currently UNKNOWN in this package)

## Evidence checklist (prepare later; do not execute new Production messaging in this gate)

- [ ] Dashboard rejection notes screenshot (sanitized)
- [ ] Business verification screenshot
- [ ] Screencast covering beats 1–6
- [ ] Written use case aligned to allowed usage
- [ ] Reviewer test instructions (URL, test user, Page name, expected avatar)
- [ ] Confirm Graph `/{PSID}?fields=name,profile_pic` returns HTTPS `profile_pic` for the **demo** user before filming avatar beat

## Explicit non-goals for this evidence set

- No Production message campaign
- No credential/webhook changes
- No code PR solely to “fake” avatar for review
- No Request/Submit until operator GO after rejection notes are known
