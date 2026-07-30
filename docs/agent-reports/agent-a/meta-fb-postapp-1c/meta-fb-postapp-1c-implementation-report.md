# META-FB-POSTAPP-1C Implementation Report

## 1. Executive summary

| Item | Value |
| --- | --- |
| Timestamp (Asia/Bangkok) | 2026-07-30 ~10:57 +07:00 |
| Base SHA | `070e305b5b78f8876460a0a09781fe10aa06714b` |
| Branch | `feature/facebook-supported-reauthorization` |
| PR number | *(filled after open)* |
| Exact PR head SHA | *(filled after push)* |
| Verdict | **READY FOR INDEPENDENT REVIEW AT EXACT SHA** (pending push/PR URL) |
| Scope | Supported Facebook re-authorization from CONNECTED/READY with confirmation UI, intent-scoped lifecycle, Page pin, credential preservation, `auth_type=rerequest` |

## 2. Root cause recap

From META-FB-POSTAPP-1B-PREFLIGHT: CONNECTED hid all OAuth CTAs; Capability UNKNOWN did not drive CTA; `READY → AUTHORIZING` was disallowed; reconnect from READY could create OAuth state but complete failed lifecycle; authorize URL lacked `auth_type=rerequest`.

## 3. Design

### UI
- CONNECTED + READY + linked Page + oauthAvailable → **Re-authorize Facebook** CTA (Assisted Connection section).
- CTA opens confirmation dialog (Cancel / Continue to Meta); Cancel never calls start API.
- Confirm POSTs `/api/channel-connect/facebook/reauthorize` once (in-flight guard).
- Dialog: ARIA modal, focus trap, Escape, initial focus Cancel, restore focus to CTA.

### Backend intent
- `oauth_transactions.intent`: `CONNECT` | `RECONNECT` | `REAUTHORIZE`
- `expected_page_id` pinned at reauthorize start from `provider_page_id`
- New route `POST /reauthorize` (ADMIN)

### Lifecycle
- `READY → AUTHORIZING` only with `allowReadyReauthorize: true` (not generic matrix entry)
- Success complete for REAUTHORIZE → `READY` / display `CONNECTED`
- Failure/cancel/mismatch → restore `READY`, leave credentials intact

### OAuth URL
- Reauthorize only: `auth_type=rerequest`
- Scopes unchanged: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`

### Subscription boundary
- Existing `subscribeAndVerifyFacebookPageWebhook` on successful complete retained (no field-set expansion).
- No new subscribed_apps POST/DELETE APIs.

## 4. Changed files

| File | Change | Reason |
| --- | --- | --- |
| `app/api/channel-connect/facebook/reauthorize/route.ts` | Added | ADMIN reauthorize start |
| `src/application/facebookOAuth/facebookOAuthService.ts` | Extended | startReauthorize, page pin, restore READY, rerequest URL |
| `src/lib/channelConnectionLifecycle.ts` | Extended | intent-guarded READY→AUTHORIZING |
| `src/domain/oauthTransactions.ts` | Extended | intent, expectedPageId, PAGE_MISMATCH |
| `src/infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.ts` | Extended | persist intent/expected page |
| `src/infrastructure/adapters/meta/facebookGraphOAuth.ts` | Extended | optional auth_type=rerequest |
| `src/ui/FacebookConnectCard.tsx` | Extended | CTA + confirm flow |
| `src/ui/FacebookReauthorizeConfirmDialog.tsx` | Added | accessible confirmation |
| `src/ui/facebookReauthorizeModel.ts` | Added | CTA/copy helpers |
| `supabase/migrations/20260730100000_fb_oauth_reauthorize_intent.sql` | Added | DB columns |
| Tests + docs under `meta-fb-postapp-1c/` | Added/updated | coverage + evidence |

## 5. State transition matrix

| Intent | Initial state | Intermediate | Success | Failure |
| --- | --- | --- | --- | --- |
| CONNECT | DRAFT/… | AUTHORIZING | AUTHORIZING → health → READY | prior behavior |
| RECONNECT | RECONNECT_REQUIRED/ERROR | AUTHORIZING | prior behavior | prior behavior |
| REAUTHORIZE | READY | AUTHORIZING + tx REAUTHORIZE | READY/CONNECTED | READY + credentials preserved |

## 6. Side-effect matrix

| Operation | Initial connect | Reconnect | Reauthorize |
| --- | --- | --- | --- |
| OAuth state write | Yes | Yes | Yes (intent REAUTHORIZE) |
| Lifecycle update | → AUTHORIZING | → AUTHORIZING if allowed | READY→AUTHORIZING (opt-in) → READY |
| Credential replacement | On complete | On complete | On complete after Page match only |
| Page binding change | Selected page | Selected page | Pinned expected page only |
| subscribed_apps mutation | Existing complete subscribe | Existing | Existing complete subscribe (unchanged set) |
| Resolver cutover | No | No | No |

## 7. Security review

See `security-and-side-effects-review.md`.

## 8. Test coverage

Representative cases covered: CTA visibility, confirm cancel/start, lifecycle opt-in, reauthorize route ADMIN/READY/rerequest, page mismatch without credential write, authorize URL scopes, parse complete READY for reauth, full suite 2896 pass.

## 9. Validation results

| Check | Result |
| --- | --- |
| Targeted tests | PASS |
| Full tests | PASS (2896/2896) |
| Typecheck | PASS |
| Lint | PASS |
| Build | PASS |

## 10. Known limitations

- PR did **not** run Production OAuth / re-authorize.
- Did **not** verify subscribed_apps after reauthorization.
- Did **not** run inbound/outbound smoke.
- Production deployment unchanged.
- Capability health may remain UNKNOWN until a separate health verification gate.
- Migration must be applied before Production deploy of this PR.

## 11. Independent review handoff

- Branch: `feature/facebook-supported-reauthorization`
- Base SHA: `070e305b5b78f8876460a0a09781fe10aa06714b`
- High-risk areas: lifecycle opt-in, complete page pin, credential overwrite timing, existing webhook subscribe side effect
- Reviewer commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- Evidence: `docs/agent-reports/agent-a/meta-fb-postapp-1c/`
