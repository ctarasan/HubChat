# INBOX-MOBILE-1 Architecture Discovery

## Baseline
- master SHA: `6621f998a985d67c5149d99a1cd7cc1c324ab001`

## Discovered Architecture

| Component | File | Notes |
|-----------|------|-------|
| Main Dashboard | `src/ui/DashboardPage.tsx` | ~3500 line monolithic client component |
| Desktop layout | `app/globals.css` `.dashboard-root` | CSS Grid: `app-rail | inbox-col | chat` (+context) |
| App Rail | `src/ui/DashboardAppRail.tsx` | Brand, nav items, footer (reload/signout/setup) |
| Conversation list | `DashboardPage.tsx` `LeadListItemRow` | Cards with avatar, name, preview, badges, assignment |
| Chat header | `DashboardPage.tsx` `.chat-header` | Identity, badges, status, assignment, actions menu |
| Message timeline | `DashboardPage.tsx` `buildTimeline()` | Inline in chat section, `<ul class="message-list">` |
| Composer | `DashboardPage.tsx` `.chat-composer` | Textarea, attach, templates, send |
| Context panel | `DashboardPage.tsx` `.dashboard-context-panel` | Tabbed: Details, Marketing, Activity |
| Filters drawer | `DashboardPage.tsx` `.inbox-filters-drawer-root` | Right-slide dialog |
| Logout dialog | `src/ui/LogoutConfirmDialog.tsx` | Portal dialog |
| State | `DashboardPage` useState | selectedConversationId, inboxFilters, draftText, messages |
| Existing responsive | `globals.css` `@media (max-width: 980px)` | Stacks all panels vertically |
| Tests | `src/ui/*.test.ts` + `tests/e2e/*.spec.ts` | node:test + Playwright |

## Breakpoint Changes

| Range | Before | After |
|-------|--------|-------|
| < 768px | Stacked (same as < 980) | Mobile single-panel |
| 768–1023px | Desktop 3-col | Tablet 2-pane |
| ≥ 1024px | Desktop 3-col | Desktop 3-col (unchanged) |

## Files Changed

1. `src/ui/DashboardPage.tsx` — mobile state model, Back button, mobile header, bottom sheet
2. `app/globals.css` — new breakpoints, mobile/tablet/desktop CSS classes
3. `src/ui/dashboardContextPanel.test.ts` — fix source-string search for multi-line section tag
4. `src/ui/dashboardResponsiveMobile.test.ts` — 26 focused mobile responsive tests (new)
