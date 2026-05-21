import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelPatchBody,
  buildTenantAuthHeaders,
  channelPathParam,
  defaultChannelView,
  draftFromView,
  mergeListWithAllChannels,
  parseChannelSettingsListResponse,
  resolveMeTenantAuthContext,
  secretStateForField,
  type ChannelSettingView
} from "./channelSettingsModel.js";

const lineRowG2: ChannelSettingView = {
  channel: "LINE",
  enabled: true,
  configured: true,
  status: "READY",
  providerPageId: "page-1",
  providerAccountName: "LINE OA",
  lastVerifiedAt: "2026-01-01T12:00:00.000Z",
  lastError: null,
  updatedAt: "2026-01-02T00:00:00.000Z",
  secretState: {
    channelSecret: "SET",
    accessToken: "EMPTY"
  }
};

test("parseChannelSettingsListResponse merges LINE FACEBOOK INSTAGRAM from G2 shape", () => {
  const r = parseChannelSettingsListResponse({ data: [lineRowG2] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.length, 3);
  assert.equal(r.data[0]!.channel, "LINE");
  assert.equal(r.data[0]!.status, "READY");
  assert.equal(r.data[0]!.providerAccountName, "LINE OA");
  assert.equal(secretStateForField(r.data[0]!, "channelSecret"), "SET");
  assert.equal(secretStateForField(r.data[0]!, "accessToken"), "EMPTY");
});

test("parseChannelSettingsListResponse never exposes raw secret values", () => {
  const r = parseChannelSettingsListResponse({ data: [lineRowG2] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const serialized = JSON.stringify(r.data[0]);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("secret_json"), false);
});

test("parseChannelSettingsListResponse supports legacy secretsConfigured fallback", () => {
  const r = parseChannelSettingsListResponse({
    data: [
      {
        channel: "FACEBOOK",
        enabled: false,
        secretsConfigured: [
          { key: "page_access_token", configured: true, fingerprint: "abc" },
          { key: "app_secret", configured: false, fingerprint: null }
        ]
      }
    ]
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const fb = r.data.find((c) => c.channel === "FACEBOOK");
  assert.equal(fb?.secretState.accessToken, "SET");
  assert.equal(fb?.secretState.appSecret, "EMPTY");
});

test("buildChannelPatchBody sends only non-blank secrets and clearSecrets", () => {
  const baseline = mergeListWithAllChannels([lineRowG2])[0]!;
  const draft = draftFromView(baseline);
  draft.enabled = false;
  const built = buildChannelPatchBody(
    baseline,
    draft,
    { channel_access_token: "new-token-value", channel_secret: "   " },
    ["channel_secret"]
  );
  assert.equal(built.ok, true);
  if (!built.ok || built.body === null) return;
  assert.equal(built.body.enabled, false);
  assert.deepEqual(built.body.secrets, { channel_access_token: "new-token-value" });
  assert.deepEqual(built.body.clearSecrets, ["channel_secret"]);
});

test("buildChannelPatchBody returns null when nothing changed", () => {
  const baseline = mergeListWithAllChannels([lineRowG2])[0]!;
  const draft = draftFromView(baseline);
  const built = buildChannelPatchBody(baseline, draft, {}, []);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.body, null);
});

test("blank secret inputs are omitted from PATCH body", () => {
  const baseline = defaultChannelView("INSTAGRAM");
  const draft = draftFromView(baseline);
  const built = buildChannelPatchBody(baseline, draft, { access_token: "", verify_token: "  " }, []);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.body, null);
});

test("channelPathParam uses lowercase path segment", () => {
  assert.equal(channelPathParam("LINE"), "line");
  assert.equal(channelPathParam("INSTAGRAM"), "instagram");
});

test("buildTenantAuthHeaders always includes x-tenant-id last", () => {
  const headers = buildTenantAuthHeaders(
    { baseUrl: "https://app.example", accessToken: "tok", tenantId: "tenant-42" },
    { "Content-Type": "application/json", "x-tenant-id": "" }
  );
  assert.equal(headers["x-tenant-id"], "tenant-42");
});

test("resolveMeTenantAuthContext prefers me tenant for admin channel calls", () => {
  const ctx = resolveMeTenantAuthContext({
    baseUrl: "https://app.example",
    accessToken: "tok",
    sessionTenantId: "session-tenant",
    meTenantId: "me-tenant",
    requireMeTenant: true
  });
  assert.equal(ctx?.tenantId, "me-tenant");
});
