# IG-AUTH-2E.0 Outbound Provider Contract (Instagram Login)

> Official source checked: [Instagram Messaging API — Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
> Checked: 2026-06-19
> Implementation deferred to IG-AUTH-2E.1+

## Host and version

| Item | Contract |
| --- | --- |
| Host | `https://graph.instagram.com` only |
| Path | `/{IG_ID}/messages` or `/me/messages` |
| Version | Central `META_GRAPH_VERSION` / `readInstagramOAuthServerConfig().graphVersion` — do not hard-code in adapter |
| Token transport | `Authorization: Bearer <token>` header |
| Token in URL | Forbidden for OAuth adapter |

## Identity semantics (from IG-AUTH-2D)

| Role | ID source |
| --- | --- |
| Sender (`<IG_ID>` or `/me`) | Instagram professional account ID from OAuth `/me.user_id` (`provider_instagram_account_id`) |
| Recipient | Instagram-scoped user ID (IGSID) from webhook / `provider_external_user_id` / `ig:user:{IGSID}` thread |
| OAuth token-response `user_id` | Must match `/me.user_id`; not used as messaging recipient |

## Text message

```http
POST https://graph.instagram.com/{version}/{IG_ID}/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipient": { "id": "<IGSID>" },
  "message": { "text": "<TEXT_OR_LINK>" }
}
```

- Text limit: 1000 bytes UTF-8
- Success fields: `recipient_id`, `message_id`

## Image message

Official docs show `message.attachments` array (multi-image) and singular `attachment` for audio/video/file.

HubChat legacy adapter uses singular `message.attachment` on **Facebook Graph Page** endpoint. OAuth adapter must follow **Instagram Login** doc shape exactly — validate in IG-AUTH-2E.2 with mocked provider responses before cutover.

Constraints from docs:

- Image formats: png, jpeg
- Max size: 8MB
- URL must be public HTTPS fetchable by Meta

## Permissions (minimum for send)

- `instagram_business_basic`
- `instagram_business_manage_messages`

Connect flow (IG-AUTH-2C) already requests business messaging scopes; outbound cutover must not assume scope parity from `/me` alone.

## Messaging window

- Free-form replies only within 24 hours of user's last message to the professional account
- Outside window → terminal delivery failure (`MESSAGE_WINDOW_CLOSED` taxonomy in 2E audit)
- Human-agent tag extensions deferred

## Private reply

Comment private reply uses different recipient shape (`comment_id`). **Not in IG-AUTH-2E scope** — defer to IG-AUTH-2F. Legacy path uses `graph.facebook.com/{pageId}/messages` with Page token.

## Error handling

Map provider Graph error object (`error.code`, `error.error_subcode`, HTTP status) to sanitized internal taxonomy only. Never persist or log raw response bodies containing tokens.
