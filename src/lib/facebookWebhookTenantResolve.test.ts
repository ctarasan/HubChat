import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../domain/channelConnections.js";
import {
  extractFacebookWebhookEntryPageIds,
  resolveFacebookWebhookTenantId
} from "./facebookWebhookTenantResolve.js";

const DEFAULT_TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const APP_REVIEW_TENANT = "6797c114-a4fe-4546-a655-8ce2287fedfe";
const TEST_PAGE = "657955874072241";
const SMARTKORP_PAGE = "541846535686129";

function connection(overrides: Partial<ChannelConnectionRecord>): ChannelConnectionRecord {
  const now = new Date("2026-07-12T06:00:00.000Z");
  return {
    id: "conn-1",
    tenantId: APP_REVIEW_TENANT,
    provider: "FACEBOOK",
    status: "READY",
    providerAccountId: TEST_PAGE,
    providerAccountName: "Connex Business Online",
    providerPageId: TEST_PAGE,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("extractFacebookWebhookEntryPageIds reads entry.id values", () => {
  assert.deepEqual(
    extractFacebookWebhookEntryPageIds({
      object: "page",
      entry: [{ id: TEST_PAGE, messaging: [] }, { id: TEST_PAGE }]
    }),
    [TEST_PAGE]
  );
});

test("resolveFacebookWebhookTenantId prefers unique page connection over DEFAULT_TENANT_ID", () => {
  const resolved = resolveFacebookWebhookTenantId({
    entryPageIds: [TEST_PAGE],
    connectionsByPageId: [connection({})],
    fallbackTenantId: DEFAULT_TENANT
  });
  assert.equal(resolved.tenantId, APP_REVIEW_TENANT);
  assert.equal(resolved.source, "page_connection");
  assert.equal(resolved.ambiguous, false);
});

test("resolveFacebookWebhookTenantId falls back to DEFAULT_TENANT_ID for unknown page", () => {
  const resolved = resolveFacebookWebhookTenantId({
    entryPageIds: ["999"],
    connectionsByPageId: [],
    fallbackTenantId: DEFAULT_TENANT
  });
  assert.equal(resolved.tenantId, DEFAULT_TENANT);
  assert.equal(resolved.source, "default_tenant");
});

test("resolveFacebookWebhookTenantId keeps SmartKorp fallback when only SmartKorp page matches", () => {
  const resolved = resolveFacebookWebhookTenantId({
    entryPageIds: [SMARTKORP_PAGE],
    connectionsByPageId: [
      connection({
        tenantId: DEFAULT_TENANT,
        providerPageId: SMARTKORP_PAGE,
        providerAccountId: SMARTKORP_PAGE,
        providerAccountName: "SMARTKORP"
      })
    ],
    fallbackTenantId: DEFAULT_TENANT
  });
  assert.equal(resolved.tenantId, DEFAULT_TENANT);
  assert.equal(resolved.source, "page_connection");
});

test("resolveFacebookWebhookTenantId does not route AUTHORIZING without page match into wrong tenant", () => {
  const resolved = resolveFacebookWebhookTenantId({
    entryPageIds: [TEST_PAGE],
    connectionsByPageId: [],
    fallbackTenantId: DEFAULT_TENANT,
    headerTenantId: null
  });
  assert.equal(resolved.tenantId, DEFAULT_TENANT);
  assert.equal(resolved.source, "default_tenant");
});
