import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectionScopeQuerySuffix,
  canShowIncludeDisconnectedToggle,
  connectionScopeQueryParam,
  isUnsafeConnectionLabel,
  resolveAnalyticsConnectionScopeBanner,
  resolveConnectionLabel,
  resolveConnectionLabelDescriptor,
  resolveConnectionScopeEmptyState,
  resolveEffectiveConnectionScope,
  resolveWorkQueueConnectionFallback,
  readConnectionScopeBucket
} from "./channelConnectionScopeModel.js";

test("active-only default omits connectionScope query param", () => {
  assert.equal(connectionScopeQueryParam("active"), "");
  assert.equal(buildConnectionScopeQuerySuffix("ADMIN", false), "");
  assert.equal(resolveEffectiveConnectionScope("MANAGER", false), "active");
});

test("admin/manager include disconnected sends connectionScope=all", () => {
  assert.equal(connectionScopeQueryParam("all"), "&connectionScope=all");
  assert.equal(buildConnectionScopeQuerySuffix("ADMIN", true), "&connectionScope=all");
  assert.equal(buildConnectionScopeQuerySuffix("MANAGER", true), "&connectionScope=all");
});

test("sales cannot override scope even if toggle state true", () => {
  assert.equal(canShowIncludeDisconnectedToggle("SALES"), false);
  assert.equal(resolveEffectiveConnectionScope("SALES", true), "active");
  assert.equal(buildConnectionScopeQuerySuffix("SALES", true), "");
});

test("resolveConnectionLabel uses API connection_label", () => {
  assert.equal(
    resolveConnectionLabel({ connection_label: "Acme Retail Page" }),
    "Acme Retail Page"
  );
  assert.equal(
    resolveConnectionLabel({ connectionLabel: "SmartKorp LINE OA" }),
    "SmartKorp LINE OA"
  );
});

test("unknown connection label fallback when missing or unsafe", () => {
  assert.equal(resolveConnectionLabel({}), "Unknown connection");
  assert.equal(
    resolveConnectionLabel({
      connection_label: "1137356672785125",
      provider_page_id: "1137356672785125"
    }),
    "Unknown connection"
  );
  assert.equal(isUnsafeConnectionLabel("1137356672785125", { provider_page_id: "1137356672785125" }), true);
  assert.equal(isUnsafeConnectionLabel("https://example.com/x", {}), true);
});

test("scope bucket chip only when include disconnected or emphasize detail", () => {
  const hidden = resolveConnectionLabelDescriptor(
    { connection_label: "Old Test Page", connection_scope_bucket: "historical" },
    { includeDisconnectedChannels: false }
  );
  assert.equal(hidden.showScopeBucketChip, false);

  const listShown = resolveConnectionLabelDescriptor(
    { connection_label: "Old Test Page", connection_scope_bucket: "historical" },
    { includeDisconnectedChannels: true }
  );
  assert.equal(listShown.showScopeBucketChip, true);
  assert.equal(listShown.scopeBucketChipLabel, "Historical");

  const detailShown = resolveConnectionLabelDescriptor(
    { connection_label: "Old Test Page", connection_scope_bucket: "historical" },
    { emphasizeScopeBucket: true }
  );
  assert.equal(detailShown.showScopeBucketChip, true);
});

test("readConnectionScopeBucket accepts camelCase", () => {
  assert.equal(readConnectionScopeBucket({ connectionScopeBucket: "active" }), "active");
  assert.equal(readConnectionScopeBucket({ connection_scope_bucket: "historical" }), "historical");
  assert.equal(readConnectionScopeBucket({}), "unknown");
});

test("empty states for active connection and disconnected hidden", () => {
  const noConv = resolveConnectionScopeEmptyState("active_no_conversations", "Acme Page");
  assert.match(noConv.body, /Acme Page/);
  assert.equal(noConv.testId, "connection-scope-empty-active-no-conversations");

  const hidden = resolveConnectionScopeEmptyState("disconnected_hidden");
  assert.match(hidden.body, /Include disconnected channels/);
});

test("work queue fallback documents channel-type-only until API ready", () => {
  const fallback = resolveWorkQueueConnectionFallback(false);
  assert.equal(fallback.mode, "channel_type_only");
  assert.match(fallback.helperText ?? "", /Connection name is unavailable/);

  const ready = resolveWorkQueueConnectionFallback(true);
  assert.equal(ready.mode, "api_fields");
});

test("analytics banner when connectionScopeApplied is false", () => {
  const notApplied = resolveAnalyticsConnectionScopeBanner({
    connectionScopeApplied: false,
    connectionScopeNote: "Analytics aggregate counts remain tenant-wide."
  });
  assert.equal(notApplied.visible, true);
  assert.match(notApplied.message, /tenant-wide/i);

  const applied = resolveAnalyticsConnectionScopeBanner({ connectionScopeApplied: true });
  assert.equal(applied.visible, false);
});
