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
  resolveWorkQueueConnectionFallback
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

test("disconnected chip only when include disconnected and status disconnected", () => {
  const hidden = resolveConnectionLabelDescriptor(
    { connection_label: "Old Test Page", connection_status: "disconnected" },
    { includeDisconnectedChannels: false }
  );
  assert.equal(hidden.showDisconnectedChip, false);

  const shown = resolveConnectionLabelDescriptor(
    { connection_label: "Old Test Page", connection_status: "disconnected" },
    { includeDisconnectedChannels: true }
  );
  assert.equal(shown.showDisconnectedChip, true);
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
  assert.match(fallback.helperText ?? "", /Workflow API/);

  const ready = resolveWorkQueueConnectionFallback(true);
  assert.equal(ready.mode, "api_fields");
});

test("analytics banner when API lacks scope or history excluded", () => {
  const unsupported = resolveAnalyticsConnectionScopeBanner({
    apiSupportsConnectionScope: false,
    includeDisconnectedChannels: false,
    hasDisconnectedHistory: true
  });
  assert.equal(unsupported.visible, true);

  const activeOnly = resolveAnalyticsConnectionScopeBanner({
    apiSupportsConnectionScope: true,
    includeDisconnectedChannels: false,
    hasDisconnectedHistory: true
  });
  assert.equal(activeOnly.visible, true);
  assert.match(activeOnly.message, /active connections only/i);
});
