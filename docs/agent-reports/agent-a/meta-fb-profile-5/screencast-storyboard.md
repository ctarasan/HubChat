# META-FB-PROFILE-5 — Screencast Storyboard

**Status:** PREPARE ONLY — do not record Production campaign / do not Request BAUPA in this gate.  
**Language:** English UI required throughout.  
**Honesty rule:** Do **not** fabricate a working `profile_pic`. If Graph still denies User Profile API, show available flow + clear captions for post-approval avatar behavior.

## Pre-roll (off camera)

- Use English HubChat UI (browser language + product copy).
- Zoom ~110–125% for readability.
- Hide bookmarks/PII; never show tokens, `.env`, Network Authorization headers, or DB secrets.
- Prefer a disposable demo Messenger user; blur unrelated contacts.

## Storyboard

| # | Time cue | Screen / action | On-screen caption / tooltip | Reviewer must see |
|---|---|---|---|---|
| 00 | 0:00 | HubChat landing / login page (English) | “HubChat — shared customer inbox” | Start inside HubChat |
| 01 | 0:10 | Agent logs into HubChat (complete login) | “Agent login” | Complete HubChat auth |
| 02 | 0:25 | Open Channel Settings → Facebook section | “Facebook channel connection” | Where Meta connect lives |
| 03 | 0:35 | Click **Connect Facebook** / **Continue Connect Facebook** (or Reauthorize if documenting re-grant; prefer clean Connect path) | “Start Meta OAuth” | Button explanation |
| 04 | 0:40 | Meta login page (`facebook.com/.../dialog/oauth`) — complete login | “Complete Meta login” | Full Meta login, not cut |
| 05 | 1:10 | Meta permission / Page access grant UI for HubChat app | “Grant Page messaging access (pages_show_list, pages_messaging, pages_manage_metadata)” | User/admin granting access |
| 06 | 1:35 | Return to HubChat OAuth resume / Page select | “Select Facebook Page (business asset)” | Page / business asset selection |
| 07 | 1:50 | Confirm Page tasks / finish connect | “Connect Page to HubChat” | Grant completion in product |
| 08 | 2:05 | Channel Settings shows CONNECTED / READY for SMARTKORP | “Facebook Page connected” | Successful connection |
| 09 | 2:20 | **Architecture caption card (5–8s)** | “Server-side: HubChat exchanges OAuth code → long-lived user token → Page Access Token (encrypted). Inbound webhooks use Page Access Token. BAUPA Advanced Access enables User Profile API fields (name, profile_pic) for Messenger PSIDs. No system-user token in this Facebook path.” | Server-to-server disclosure |
| 10 | 2:35 | Messenger (customer) sends a short message to SMARTKORP Page | “Customer messages the Page” | Messenger inbound trigger |
| 11 | 2:50 | HubChat Inbox: conversation appears / updates | “Inbound message arrives in HubChat Inbox” | End-to-end ingest |
| 12 | 3:05 | Highlight contact/participant **display name** | “Customer identity (name)” | Identity visible |
| 13 | 3:15 | Caption: profile lookup path | “On inbound, HubChat calls Graph User Profile API: GET /{PSID}?fields=name,first_name,last_name,profile_pic using Page Access Token” | Lookup explained |
| 14 | 3:30 | Point to **ConversationAvatar** slot (list + header) | **IF live pic available:** “profile_pic displayed here” / **IF not available (current BAUPA rejected):** “Avatar slot — currently initials fallback; after BAUPA Advanced Access approval, HTTPS profile_pic renders in this same UI” | Profile picture use location; no fabrication |
| 15 | 3:45 | Short explanation card | “Why BAUPA: agents need visual customer identification in a multi-conversation Inbox. Allowed usage: User Fields in business app experience. Not used for ads targeting or surveillance.” | Business value + allowed usage |
| 16 | 4:00 | Final Inbox view with name + avatar slot + open conversation | “End-to-end: Meta connect → Messenger inbound → identity → Inbox avatar use case” | Complete E2E |

## BAUPA grant note (critical)

HubChat’s OAuth authorize scopes are **`pages_show_list`, `pages_messaging`, `pages_manage_metadata` only** (`facebookOAuthScopes()`).  
**BAUPA is not an OAuth scope string** in the HubChat authorize URL; it is an App Review **feature / Advanced Access** for User Profile API with Page token.

In the screencast:

- Show the **Meta login + pages_* grant** that HubChat actually performs.
- Use captions to explain BAUPA Advanced Access is what enables `profile_pic` on `GET /{PSID}`.
- Do **not** imply BAUPA appears as a checkbox in HubChat OAuth scopes if it does not.

## Post-approval expected behavior (caption-safe)

After BAUPA Advanced Access is approved and Graph returns HTTPS `profile_pic`:

1. Same inbound path persists `profile_image_url`.
2. Same `ConversationAvatar` renders the image instead of initials.
3. No HubChat UI redesign required for the demo claim.

## Out of scope for this recording

- Instagram flows
- Advertising tools
- Showing raw Graph responses with tokens
- Claiming live `profile_pic` if Graph still returns `100/33`
