import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modelSource = readFileSync(new URL("./sourcePostContextModel.ts", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("./SourcePostContextCard.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("SourcePostContextCard renders section title and badge", () => {
  assert.equal(cardSource.includes("SOURCE POST"), true);
  assert.equal(cardSource.includes("data-testid=\"source-post-context-card\""), true);
  assert.equal(cardSource.includes("LEAD COMMENT"), true);
  assert.equal(cardSource.includes("Open post"), true);
});

test("Open post button never displays raw URL as visible text", () => {
  assert.equal(cardSource.includes("Open post"), true);
  assert.equal(cardSource.match(/>\s*https?:\/\//), null);
  assert.equal(cardSource.includes("{context.openPostHref}"), false);
});

test("card does not render provider id field names", () => {
  assert.equal(cardSource.includes("provider_page_id"), false);
  assert.equal(cardSource.includes("provider_thread_id"), false);
  assert.equal(cardSource.includes("provider_comment_id"), false);
});

test("Dashboard details panel wires SourcePostContextCard", () => {
  assert.equal(dashboardSource.includes("SourcePostContextCard"), true);
  assert.equal(dashboardSource.includes("resolveSourcePostContext"), true);
  assert.equal(dashboardSource.includes("selectedSourcePostContext"), true);
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-details"'), true);
});

test("model blocks unsafe content patterns", () => {
  assert.equal(modelSource.includes("isUnsafeSourcePostContent"), true);
  assert.equal(modelSource.includes("sanitizeSourcePostText"), true);
  assert.match(modelSource, /never renders|FPC-1A/i);
});

test("globals.css defines source post context card styles", () => {
  assert.match(globalsCss, /\.source-post-context-card\s*\{/);
  assert.match(globalsCss, /\.source-post-context-snippet/);
  assert.match(globalsCss, /-webkit-line-clamp:\s*3/);
});

test("globals.css stacks Source Post thumbnail full-width above snippet", () => {
  assert.match(globalsCss, /\.source-post-context-preview\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(globalsCss, /\.source-post-context-thumb\s*\{[^}]*width:\s*100%/s);
  assert.match(globalsCss, /\.source-post-context-thumb\s*\{[^}]*height:\s*250px/s);
  assert.match(globalsCss, /\.source-post-context-thumb\s*\{[^}]*object-fit:\s*cover/s);
});

test("test button hidden when openPostAvailable is false", () => {
  assert.equal(cardSource.includes("context.openPostAvailable"), true);
  assert.equal(cardSource.includes("showOpenPost"), true);
});

test("SourcePostContextCard does not render empty thumbnail placeholder", () => {
  assert.equal(cardSource.includes("source-post-context-thumb-placeholder"), false);
  assert.equal(cardSource.includes("showThumbnailPlaceholder"), false);
  assert.equal(cardSource.includes("context.postThumbnailUrl"), true);
});
