# INBOX-MOBILE-1 Remediation Evidence

Independent review of `5c5065a85f1cb85ab5186cd75189f43d87a6eab5` required changes (B1/B2/B3).

## Screenshots (fixture, sanitized)

| File | Description |
|------|-------------|
| `320-mobile-list-light.png` | Mobile list Light @ 320×568 |
| `375-mobile-list-dark.png` | Mobile list Dark @ 375×667 |
| `mobile-chat-light.png` | Mobile active chat |
| `mobile-appearance-menu.png` | Mobile overflow Appearance menu |
| `mobile-details-sheet-focused-close.png` | Details sheet with Close focused |
| `tablet-two-pane-light.png` | Tablet two-pane @ 768×1024 |
| `desktop-1024-regression.png` | Desktop @ 1024×768 |
| `desktop-1440-regression.png` | Desktop @ 1440×900 |

## Runtime fixture

- Local Next.js on `127.0.0.1:3017`
- Dummy session key `hubchat.session.config.v1` with fake token
- Playwright route interception for `/api/*`
- Spec: `tests/e2e/inbox-mobile-responsive-fixture.spec.ts`
- Config: `playwright.inbox-mobile.config.ts`

## Commands

```
npx playwright test -c playwright.inbox-mobile.config.ts
npm test
npm run typecheck
npm run lint
npm run build
```
