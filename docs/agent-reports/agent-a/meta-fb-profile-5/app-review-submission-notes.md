# App Review Submission Notes — Business Asset User Profile Access

**DRAFT ONLY — do not paste into Meta Dashboard / do not submit in this gate.**  
**Language:** English

---

## 1. What HubChat is

HubChat is a shared customer messaging inbox used by business teams to manage conversations from messaging channels (including Facebook Messenger) in one place.

## 2. Who uses it

Authenticated tenant agents and admins (customer support / operations staff) use HubChat to view and reply to customer conversations for their connected Facebook Page.

## 3. Why Facebook Messenger integration is required

Customers contact the business via Messenger on the Facebook Page. HubChat connects that Page so inbound and outbound Messenger messages are handled inside the shared inbox instead of only in native Facebook Inbox.

## 4. Why Business Asset User Profile Access is required

When a Messenger customer messages the Page, HubChat receives a Page-scoped ID (PSID). To personalize the agent Inbox, HubChat calls the Messenger User Profile API with the Page Access Token to read profile fields such as name and `profile_pic`.

Official Meta documentation requires **Advanced Access for Business Asset User Profile Access** to retrieve these User Profile fields for people engaging with the Page.

This feature is used only to read User Fields needed for the business app experience (Inbox identification). It is not used for advertising targeting or unrelated profiling.

## 5. What `profile_pic` is used for

`profile_pic` provides the customer’s profile image URL so agents can visually recognize the Messenger customer in the conversation list and conversation header.

## 6. Where it appears in HubChat

- Inbox conversation list avatar  
- Selected conversation header avatar  

If `profile_pic` is unavailable, HubChat falls back to initials. After BAUPA Advanced Access is approved and Graph returns an HTTPS profile image URL, the same avatar components render the image.

## 7. End-to-end user experience (what the screencast shows)

1. Agent opens HubChat (English UI) and signs in.  
2. Agent opens Channel Settings and starts **Connect Facebook**.  
3. Complete **Meta login** and grant Page-related permissions used by HubChat (`pages_show_list`, `pages_messaging`, `pages_manage_metadata`).  
4. Select/connect the Facebook Page (business asset).  
5. HubChat shows the Page connection as connected.  
6. A Messenger customer sends a message to the Page.  
7. The inbound message appears in HubChat Inbox with customer identity.  
8. HubChat performs server-side User Profile lookup for the PSID using the Page Access Token (`name`, `first_name`, `last_name`, `profile_pic`).  
9. The Inbox avatar UI is where `profile_pic` is displayed for agent identification.

**Architecture disclosure:** HubChat uses **user OAuth** for Page connection, then stores an encrypted **Page Access Token**. Inbound webhooks and profile lookup run **server-side** with that Page token. HubChat’s Facebook path does **not** use a Meta System User token. BAUPA is requested as App Review Advanced Access for User Profile API fields; it is not listed as a separate OAuth scope string in HubChat’s authorize URL.

## 8. How data is used

- Collected: Messenger profile name fields and `profile_pic` URL for customers who message the Page.  
- Used for: display in the tenant Inbox for agent identification only.  
- Access: authenticated HubChat users of that tenant.  
- Not used for: ads targeting, surveillance, or selling profile data.

*(Operator should attach/confirm retention & deletion policy text from the product privacy policy before final submit.)*

## 9. What the reviewer should observe in the screencast

| Observe | Where |
|---|---|
| Complete Meta login | After Connect Facebook |
| Permission/Page grant | Meta consent + HubChat Page connect |
| Connected Page | Channel Settings CONNECTED |
| Messenger inbound → Inbox | Side-by-side Messenger + HubChat |
| Customer identity | Conversation name |
| Profile picture use case | Avatar slot (live image if available; otherwise captions describing post-approval rendering in the same UI — no fabricated image) |
| English UI + captions/tooltips | Entire video |

## Alignment statement

Meta previously noted the use case is allowed but the screencast was unclear / not aligned with use case details (Developer Policy 1.6). This resubmission screencast and these notes are written to show the complete end-to-end experience matching this description.
