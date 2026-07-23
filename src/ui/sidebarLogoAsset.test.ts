import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SMARTKORP_BRAND_ASSETS, SMARTKORP_BRAND_ALT } from "./brandAssets.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sidebarLogoPath = join(repoRoot, "public/brand/smartkorp-sidebar-logo.png");
const metaPath = join(repoRoot, "public/brand/smartkorp-sidebar-logo.meta.json");
const sourcePath = join(repoRoot, "public/brand/AW_SmartKorp_Logo_Serie-02.jpg");

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

test("sidebarLogo asset path is registered and file exists", () => {
  assert.equal(SMARTKORP_BRAND_ASSETS.sidebarLogo, "/brand/smartkorp-sidebar-logo.png");
  assert.ok(existsSync(sidebarLogoPath));
  assert.ok(existsSync(metaPath));
  assert.ok(existsSync(sourcePath));
});

test("sidebarLogo PNG is stacked and high-resolution", async () => {
  const meta = await sharp(sidebarLogoPath).metadata();
  assert.equal(meta.format, "png");
  assert.ok((meta.width ?? 0) > (meta.height ?? 0) * 0.9, "expected near-square/stacked asset");
  assert.ok((meta.width ?? 0) >= 1200);
});

test("sidebarLogo has transparent margins and painted logo fills most of the box", async () => {
  const out = await visibleBounds(sidebarLogoPath);
  assert.ok(out.bounds);
  const fillW = out.bounds!.width / out.width;
  const fillH = out.bounds!.height / out.height;
  assert.ok(fillW >= 0.75);
  assert.ok(fillH >= 0.75);
});

test("DashboardAppRail uses sidebarLogo and removes HubChat product label", () => {
  const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
  assert.ok(railSource.includes("SMARTKORP_BRAND_ASSETS.sidebarLogo"));
  assert.equal(railSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"), false);
  assert.equal(railSource.includes("app-rail-product"), false);
  assert.equal(railSource.includes(">HubChat<"), false);
  assert.equal(SMARTKORP_BRAND_ALT, "SmartKorp");
});
