# Login logo size — evidence index

Sanitized screenshots for `fix/ui-login-logo-size`.

| File | Description |
| --- | --- |
| 01-login-desktop-light.png | Desktop Light — enlarged SmartKorp wordmark |
| 02-login-desktop-dark.png | Desktop Dark |
| 03-login-narrow-390-light.png | ~390px Light |
| 04-login-narrow-390-dark.png | ~390px Dark |

Sizing approach:
- Removed `max-height: 52px` cap
- Desktop width `min(100%, 340px)` with `aspect-ratio: 280 / 64`
- Mobile (`max-width: 480px`) width `min(100%, 280px)`
- Intrinsic img hints updated to 340×78 for layout stability

No credentials, tokens, or customer data captured.
