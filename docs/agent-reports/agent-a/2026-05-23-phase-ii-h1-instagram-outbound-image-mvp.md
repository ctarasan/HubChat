# Agent Report

## Metadata

- Agent: A
- Date: 2026-05-23
- Phase / Task: Phase II-H1 — Instagram Outbound Image MVP
- Branch: `feature/phase-ii-h1-instagram-outbound-image-mvp`
- Base commit: `2773b86`
- Head commit: *(see branch tip after feature commit)*
- PR: *(see GitHub PR after push)*
- Status: Complete (awaiting ChatGPT review / merge)

## Goal

Enable Instagram DM outbound image sending from the Dashboard using the existing upload/policy/outbound pipeline.

Instagram outbound image only. No inbound image, PDF, video, carousel, or runtime config changes.

## Scope

- In scope: InstagramAdapter IMAGE send, shared media validation, use-case routing, upload-image route tests, Dashboard composer compatibility, tests, agent reports
- Out of scope: inbound image, PDF/file/video, DB_ONLY, webhooks, migrations, packages, lead status UI changes, unrelated Dashboard redesign

## Files Changed

| File | Change |
|------|--------|
| `src/lib/mediaPolicy.ts` | `validateInstagramOutboundImageMedia` helper |
| `src/lib/mediaPolicy.test.ts` | Instagram image policy tests |
| `src/infrastructure/adapters/channels/instagramAdapter.ts` | Use shared Instagram image validation |
| `src/application/usecases/sendOutboundMessage.ts` | Use shared validation; 8MB gate in use case |
| `src/application/usecases/sendOutboundMessage.test.ts` | Instagram IMAGE > 8MB test |
| `app/api/messages/upload-image/route.ts` | Testable handler factory |
| `src/interfaces/api/messagesUploadImage.route.test.ts` | Upload-image route tests |
| `src/ui/dashboardDataFlow.test.ts` | Instagram composer static asserts |
| `docs/agent-reports/LATEST.md` | Handoff pointer |
| `docs/agent-reports/agent-a/latest.md` | Agent A latest |
| `docs/agent-reports/agent-a/2026-05-23-phase-ii-h1-instagram-outbound-image-mvp.md` | This historical report |

## Behavior Summary

### Instagram image outbound

- TEXT unchanged.
- IMAGE sends Graph `POST /{pageId}/messages` with `messaging_type: RESPONSE` and `attachment.type: image`, `payload.url` (HTTPS).
- Optional caption sends follow-up TEXT when content is not the `[image]` placeholder.
- JPEG, PNG, WEBP up to 8MB (Meta URL attachment cap).
- PDF and other media rejected with safe domain error strings.

### Dashboard composer

- Instagram allows image attach/send (JPEG/PNG/WEBP) via `/api/messages/upload-image` then `/api/messages/send` type `image`.
- Instagram PDF blocked with friendly message.
- 8MB client-side check for Instagram images.
- Lead status UI from PR #68 unchanged (compat assert in data-flow test).

### Media policy

- Shared `validateInstagramOutboundImageMedia`: HTTPS URL, allowed MIME, Instagram 8MB cap.
- Upload route validates MIME and 10MB upload cap; returns provider-fetchable HTTPS URL.

### Permissions / errors

- Provider/token/signed URL secrets not logged.
- Adapter and use case fail locally before Meta call on invalid URL/MIME/size.

## Verification

| Check | Result |
|-------|--------|
| git diff --check | PASS |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm test | PASS |
| npm run build | PASS |
| Hidden/bidi scan | PASS (no matches) |

## Guardrails Confirmation

- No runtime config / webhook / adapter mode changes
- No DB_ONLY / migrations / packages
- No LINE/Facebook adapter behavior changes
- No unrelated Dashboard redesign
- No secrets in reports

## Known Issues / Risks

- Meta must fetch Supabase signed/public URLs; private hosts rejected at upload.
- Caption follow-up failure after image delivery returns image external id (no image retry).

## Next Recommended Step

1. Merge H1 PR after review.
2. Staging smoke: Instagram DM image with caption and without caption.
3. Prioritize Dashboard filters / Manager UX or production hardening.

## Reviewer Notes for ChatGPT

- Confirm Instagram PDF still blocked end-to-end.
- Confirm LINE/Facebook image tests unchanged.
