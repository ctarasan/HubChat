/**
 * Deterministic crop of the official SmartKorp Serie-01 square JPEG into a
 * horizontal login wordmark PNG with transparent near-white canvas.
 *
 * Usage: node scripts/brand/crop-smartkorp-login-wordmark.mjs
 *
 * Does not overwrite the source JPEG. Does not redraw or recolor the mark.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SRC = "public/brand/AW_SmartKorp_Logo_Serie-01.jpg";
const OUT = "public/brand/smartkorp-wordmark-login.png";
const META = "public/brand/smartkorp-wordmark-login.meta.json";
const WHITE = 245;
const PAD_RATIO = 0.1;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const ch = info.channels;

let minX = w;
let minY = h;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!(r >= WHITE && g >= WHITE && b >= WHITE)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

const inkW = maxX - minX + 1;
const inkH = maxY - minY + 1;
const padX = Math.round(inkW * PAD_RATIO);
const padY = Math.round(inkH * PAD_RATIO);
const left = Math.max(0, minX - padX);
const top = Math.max(0, minY - padY);
const right = Math.min(w - 1, maxX + padX);
const bottom = Math.min(h - 1, maxY + padY);
const cropW = right - left + 1;
const cropH = bottom - top + 1;

const cropped = await sharp(SRC)
  .extract({ left, top, width: cropW, height: cropH })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.from(cropped.data);
let transparent = 0;
let opaque = 0;
for (let i = 0; i < out.length; i += 4) {
  const r = out[i];
  const g = out[i + 1];
  const b = out[i + 2];
  if (r >= WHITE && g >= WHITE && b >= WHITE) {
    out[i + 3] = 0;
    transparent++;
  } else {
    opaque++;
  }
}

await sharp(out, { raw: { width: cropW, height: cropH, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const v = await sharp(OUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let vminX = v.info.width;
let vminY = v.info.height;
let vmaxX = 0;
let vmaxY = 0;
for (let y = 0; y < v.info.height; y++) {
  for (let x = 0; x < v.info.width; x++) {
    const i = (y * v.info.width + x) * 4;
    if (v.data[i + 3] < 16) continue;
    if (x < vminX) vminX = x;
    if (y < vminY) vminY = y;
    if (x > vmaxX) vmaxX = x;
    if (y > vmaxY) vmaxY = y;
  }
}

const vbW = vmaxX - vminX + 1;
const vbH = vmaxY - vminY + 1;
const meta = {
  source: SRC,
  sourceDimensions: { width: w, height: h },
  inkBoundsBeforeCrop: { minX, minY, maxX, maxY, width: inkW, height: inkH },
  paddingRatio: PAD_RATIO,
  whiteThreshold: WHITE,
  crop: { left, top, width: cropW, height: cropH },
  output: OUT,
  outputDimensions: { width: cropW, height: cropH },
  transparentPixels: transparent,
  opaquePixels: opaque,
  visibleBoundsInOutput: { minX: vminX, minY: vminY, maxX: vmaxX, maxY: vmaxY, width: vbW, height: vbH },
  visibleFillOfOutput: +((vbW * vbH) / (cropW * cropH) * 100).toFixed(2),
  aspectRatio: +(cropW / cropH).toFixed(4),
  notes: "Cropped from official Serie-01 JPEG; near-white canvas made transparent; no redraw/recolor."
};

writeFileSync(META, JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
