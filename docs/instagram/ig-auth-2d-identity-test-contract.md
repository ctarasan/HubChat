# IG-AUTH-2D Identity and Test Connection Contract

## `/me` endpoint

```text
GET https://graph.instagram.com/{META_GRAPH_VERSION}/me?fields=user_id,username,account_type
Authorization: Bearer {access_token}
```

- Host: `graph.instagram.com` only
- Version: from `META_GRAPH_VERSION` / `readInstagramOAuthServerConfig().graphVersion`
- Fields: fixed allowlist — no client-supplied fields

## Identity column mapping

| DB column | Domain type | Source |
| --- | --- | --- |
| `provider_instagram_account_id` | `InstagramProfessionalAccountId` | `/me.user_id` after verification |
| `provider_user_id` | `InstagramOAuthProviderUserId` | OAuth token exchange `user_id` |
| `verified_username` | `InstagramUsername` | `/me.username` |
| `verified_account_type` | `BUSINESS` \| `CREATOR` | `/me.account_type` (`MEDIA_CREATOR` → `CREATOR`) |
| `identity_verified_at` | timestamp | server clock at successful verification |

## Test Connection response

Uses existing `ChannelTestConnectionResponseDto`. Success message includes `@username` and masked account ID only.

## Error codes (public-safe)

See `instagramOAuthConnectErrors.ts`, `instagramIdentityValidation.ts`, and `instagramOAuthResolverErrors.ts`.
