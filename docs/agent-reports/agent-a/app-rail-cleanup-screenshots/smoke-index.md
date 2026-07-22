# App rail cleanup — evidence index

Sanitized static previews for `refactor/ui-app-rail-cleanup`.

| File | Description |
| --- | --- |
| 01-desktop-light-sign-out.png | Desktop Light: Setup/Settings absent; Sign out icon |
| 02-desktop-dark-sign-out.png | Desktop Dark: Sign out icon readable |
| 03-sign-out-hover-focus-light.png | Sign out hover/focus warning treatment |
| 04-narrow-390-light.png | ~390px Light utility row |
| 05-narrow-390-dark.png | ~390px Dark utility row |
| preview.html | Static sanitized preview (no tokens/PII) |

Notes:
- Setup route `/setup` retained (hidden from rail only)
- Settings placeholder removed from rail; Channel Settings via Channels retained
- Sign out uses existing Lucide-style `log-out` SVG; accessible name `Sign out`
- Manual Sign out remains `clearSessionConfig` + `location.replace("/login")` without `reason=session_expired`
