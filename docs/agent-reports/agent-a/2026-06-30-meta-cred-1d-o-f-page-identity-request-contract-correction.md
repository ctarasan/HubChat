# META-CRED-1D-O-F — Page Identity Request Contract Correction

## Metadata

| Field | Value |
| --- | --- |
| Agent | A |
| Date | 2026-06-30 |
| Phase | META-CRED-1D-O-F |
| RETRY-4 correlation | `0616c5c0-05c0-4ff6-9b2f-f1139e39a5be` |
| Activation flag | OFF / ABSENT (unchanged) |

---

## Investigation summary

### Current request (before fix)

```text
GET https://graph.facebook.com/{graphVersion}/{pageId}?fields=id,tasks&access_token=[redacted]
```

- **Method:** GET
- **Graph version:** `v25.0` (from `readFacebookOAuthServerConfig()`)
- **Page ID source:** `facebookConnection.providerAccountId` (trusted connection)
- **Auth:** Page access token via `access_token` query parameter
- **Token type:** Meta Page token (validated by `debug_token` first)

### Official Meta Graph v25.0 documentation

| Question | Answer |
| --- | --- |
| Is `tasks` a readable field on Page node `GET /{page-id}`? | **NO** — Page reference lists `tasks` only on `/{page-id}/assigned_users` POST, not as a Page reading field |
| Is `tasks` on User Accounts edge? | **YES** — `/me/accounts` adds `tasks` to each Page node in the edge response (User access token) |
| Can Page access token read own `id`? | **YES** — `GET /{page-id}?fields=id` is standard |
| Does `tasks` require User token + `/me/accounts`? | **YES** for task lists; not available on direct Page-node field reads |

### In-repo corroboration

`facebookOAuthOperationalHealth.test.ts` already models Graph v25.0 rejecting `fields=id,name,tasks` on a Page node with:

```text
(#100) Tried accessing nonexisting field (tasks)
```

HTTP **400** — consistent with RETRY-4 `PAGE_IDENTITY_REQUEST` / **4XX** / `JSON_ERROR_OBJECT`.

### Root cause

**PROVEN:** RETRY-4 failed because activation requested unsupported field `tasks` on the Page node. `debug_token` succeeded; failure occurred at Page identity HTTP request.

### Correction

```text
GET https://graph.facebook.com/{graphVersion}/{pageId}?fields=id&access_token=[redacted]
```

**Messaging capability enforcement** remains via `debug_token` granted scopes (`evaluateMetaPageScopePolicy` in `verifyMetaPageCredential`) — not via Page-node `tasks` (which requires User `/me/accounts` and is incompatible with Page-only activation flow).

---

## Result block

```text
META-CRED-1D-O-F RESULT:
PASS

Starting master SHA:
f51cb78a26a015f258199f65959e9710e7dc7d13

Branch:
fix/meta-cred-page-identity-fields-contract

Final commit SHA:
5a14fe80003d55c9b54fcbfcb5fd793b6b1e988d

PR:
https://github.com/ctarasan/HubChat/pull/297

Current Page identity request:
GET /{graphVersion}/{pageId}?fields=id

Is tasks valid on Page node:
NO

Is tasks documented on User Accounts edge:
YES

Root cause classification:
PROVEN

Corrected Page identity fields:
id

Debug-token validity/app/scope checks preserved:
YES

Page ID match preserved:
YES

Acceptance behavior relaxed:
NO

Token logged:
NO

Live Meta calls:
0

Production flag changes:
0

Production writes:
0

Migrations:
NONE

Resolver cutover:
NO

Decision:
READY FOR AGENT B EXACT-SHA SECURITY REVIEW
```
