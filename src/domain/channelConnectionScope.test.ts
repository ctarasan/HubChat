import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "./channelConnections.js";
import {
  conversationMatchesActiveConnectionScope,
  filterRowsByActiveConnectionScope,
  resolveConnectionLabelForRow,
  resolveInboundChannelConnectionId
} from "./channelConnectionScope.js";
import { buildTenantConnectionScopeContext } from "./channelConnectionScope.js";

function conn(partial: Partial<ChannelConnectionRecord> & Pick<ChannelConnectionRecord, "id" | "provider">): ChannelConnectionRecord {
  return {
    tenantId: "t1",
    status: "READY",
    providerAccountId: null,
    providerAccountName: "Customer Page",
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test_key_1234567890",
    webhookEndpoint: null,
    webhookActive: true,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial
  };
}

test("conversationMatchesActiveConnectionScope includes linked READY connection", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "c1", provider: "FACEBOOK", providerPageId: "541846535668129" })]
  });
  assert.equal(
    conversationMatchesActiveConnectionScope(
      { channel_type: "FACEBOOK", channel_connection_id: "c1", provider_page_id: "541846535668129" },
      ctx
    ),
    true
  );
});

test("conversationMatchesActiveConnectionScope excludes old Facebook page when active page differs", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "c-new", provider: "FACEBOOK", providerPageId: "541846535668129" })]
  });
  assert.equal(
    conversationMatchesActiveConnectionScope(
      { channel_type: "FACEBOOK", provider_page_id: "1137356672785125" },
      ctx
    ),
    false
  );
});

test("conversationMatchesActiveConnectionScope keeps unknown legacy Facebook rows without page id", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "c-new", provider: "FACEBOOK", providerPageId: "541846535668129" })]
  });
  assert.equal(conversationMatchesActiveConnectionScope({ channel_type: "FACEBOOK" }, ctx), true);
});

test("conversationMatchesActiveConnectionScope keeps LINE unlinked legacy rows visible", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "line-1", provider: "LINE", providerAccountId: "Ulinebot123" })]
  });
  assert.equal(conversationMatchesActiveConnectionScope({ channel_type: "LINE" }, ctx), true);
});

test("resolveConnectionLabelForRow never exposes raw page id", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "c1", provider: "FACEBOOK", providerPageId: "541846535668129", providerAccountName: "SmartKorp FB" })]
  });
  const result = resolveConnectionLabelForRow(
    { channel_type: "FACEBOOK", channel_connection_id: "c1", provider_page_id: "541846535668129" },
    ctx
  );
  assert.equal(result.connectionLabel, "SmartKorp FB");
  assert.equal(String(result.connectionLabel).includes("5418"), false);
});

test("resolveInboundChannelConnectionId matches Facebook page id", () => {
  const id = resolveInboundChannelConnectionId({
    channel: "FACEBOOK",
    connections: [conn({ id: "c1", provider: "FACEBOOK", providerPageId: "541846535668129" })],
    facebookPageId: "541846535668129"
  });
  assert.equal(id, "c1");
});

test("filterRowsByActiveConnectionScope filters historical Facebook page rows", () => {
  const ctx = buildTenantConnectionScopeContext({
    connections: [conn({ id: "c-new", provider: "FACEBOOK", providerPageId: "541846535668129" })]
  });
  const rows = [
    { id: "1", channel_type: "FACEBOOK", provider_page_id: "541846535668129" },
    { id: "2", channel_type: "FACEBOOK", provider_page_id: "1137356672785125" }
  ];
  const filtered = filterRowsByActiveConnectionScope(rows, ctx);
  assert.deepEqual(filtered.map((r) => r.id), ["1"]);
});
