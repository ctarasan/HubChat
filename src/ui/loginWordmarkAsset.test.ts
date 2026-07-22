import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SMARTKORP_BRAND_ASSETS, SMARTKORP_BRAND_ALT } from "./brandAssets.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const loginWordmarkPath = join(repoRoot, "public/brand/smartkorp-wordmark-login.png");
const sourcePath = join(repoRoot, "public/brand/AW_SmartKorp_Logo_Serie-01.jpg");
const metaPath = join(repoRoot, "public/brand/smartkorp-wordmark-login.meta.json");

async function visibleBounds(filePath: string, alphaThreshold = 16, white = 245) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const transparent = a < alphaThreshold || (r >= white && g >= white && b >= white);
      if (transparent) continue;
      opaque++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: w,
    height: h,
    opaque,
    bounds: opaque ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 } : null
  };
}

test("loginWordmark asset path is registered and file exists", () => {
  assert.equal(SMARTKORP_BRAND_ASSETS.loginWordmark, "/brand/smartkorp-wordmark-login.png");
  assert.ok(existsSync(loginWordmarkPath));
  assert.ok(existsSync(metaPath));
  assert.ok(existsSync(sourcePath));
});

test("loginWordmark PNG is horizontal and high-resolution", async () => {
  const meta = await sharp(loginWordmarkPath).metadata();
  assert.equal(meta.format, "png");
  assert.ok((meta.width ?? 0) > (meta.height ?? 0) * 3, "expected wide horizontal wordmark");
  assert.ok((meta.width ?? 0) >= 1200, "retain enough resolution for 2x DPR");
  assert.ok((meta.height ?? 0) >= 280);
});

test("loginWordmark has transparent margins and painted logo fills most of the box", async () => {
  const out = await visibleBounds(loginWordmarkPath);
  assert.ok(out.bounds);
  const fillW = out.bounds!.width / out.width;
  const fillH = out.bounds!.height / out.height;
  assert.ok(fillW >= 0.75, `painted width fraction too low: ${fillW}`);
  assert.ok(fillH >= 0.75, `painted height fraction too low: ${fillH}`);
  assert.ok(out.opaque > 50_000);

  // Corners should be transparent (no white matte square).
  const { data, info } = await sharp(loginWordmarkPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const corner = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(corner(0, 0), 0);
  assert.equal(corner(info.width - 1, 0), 0);
  assert.equal(corner(0, info.height - 1), 0);
  assert.equal(corner(info.width - 1, info.height - 1), 0);
});

test("source square JPEG still has tiny painted fill relative to canvas", async () => {
  const src = await visibleBounds(sourcePath);
  assert.ok(src.bounds);
  const boxFill = (src.bounds!.width * src.bounds!.height) / (src.width * src.height);
  assert.ok(boxFill < 0.15, `source canvas still mostly empty: ${boxFill}`);
  assert.equal(src.width, src.height);
});

test("crop meta documents source and crop dimensions", () => {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    source: string;
    crop: { width: number; height: number };
    outputDimensions: { width: number; height: number };
    visibleBoundsInOutput: { width: number; height: number };
  };
  assert.match(meta.source, /AW_SmartKorp_Logo_Serie-01\.jpg$/);
  assert.equal(meta.outputDimensions.width, meta.crop.width);
  assert.equal(meta.outputDimensions.height, meta.crop.height);
  assert.ok(meta.visibleBoundsInOutput.width / meta.outputDimensions.width >= 0.75);
});

test("Login page uses loginWordmark with SmartKorp alt and keeps chrome", () => {
  const loginSource = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");
  assert.ok(loginSource.includes("SMARTKORP_BRAND_ASSETS.loginWordmark"));
  assert.equal(loginSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"), false);
  assert.ok(loginSource.includes("SMARTKORP_BRAND_ALT"));
  assert.equal(SMARTKORP_BRAND_ALT, "SmartKorp");
  assert.match(loginSource, /Sign in to HubChat/);
  assert.match(loginSource, /Advanced setup/);
  assert.match(loginSource, /login-session-expired-notice/);
  assert.match(loginSource, /data-testid="login-submit"/);
});
