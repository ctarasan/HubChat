# Login visible wordmark — evidence

## Why PR #330 looked unchanged

`AW_SmartKorp_Logo_Serie-01.jpg` is a **2500×2500** square JPEG. The painted wordmark occupies only about **1668×368** pixels (~10% of the canvas).

PR #330 set the `<img>` box to ~340×78 with `object-fit: contain`, so the **entire square** was fitted into the short box. Rendered painted width was only ~**52px**.

## Asset decision

No official horizontal SVG/PNG existed under `public/brand` (only Serie-01 and Serie-02 JPEGs).

Created cropped transparent derivative:

| | Source | Output |
| --- | --- | --- |
| File | `AW_SmartKorp_Logo_Serie-01.jpg` | `smartkorp-wordmark-login.png` |
| Dimensions | 2500×2500 | 2002×442 |
| Visible paint | 1668×368 | 1668×368 (83% of width) |
| Background | White canvas | Transparent (+ Dark-mode tight white plate via CSS) |

Crop script: `scripts/brand/crop-smartkorp-login-wordmark.mjs`  
Meta: `public/brand/smartkorp-wordmark-login.meta.json`

## CSS sizing (visible paint, not empty canvas)

| Viewport | `<img>` box | Visible painted width | Fill of box |
| --- | --- | --- | --- |
| Desktop | 192×42.4 | **160px** | 83.3% |
| 390px | 168×37.1 | **140px** | 83.3% |
| 320px | 168×37.1 | **140px** | 83.3% |

Previous Production visible painted width ≈ **52px**.

## Screenshots

| File | Description |
| --- | --- |
| 00-production-current-desktop-light.png | Current Production after #330 |
| 01-local-desktop-light.png | New desktop Light |
| 02-local-desktop-dark.png | New desktop Dark (tight white plate, no square matte) |
| 03-local-narrow-390.png | 390px |
| 04-local-narrow-320.png | 320px |
| 05-local-session-expired.png | Session-expired notice |
| 06-compare-square-vs-cropped.png | Same box width: square JPEG vs cropped PNG |
| measurements.json | img box + visible paint bounds |

No credentials, tokens, or customer data captured.
