import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelPatchBody,
  buildTenantAuthHeaders,
  channelPathParam,
  defaultChannelDto,
  draftFromDto,
  mergeListWithAllChannels,
  parseChannelSettingsListResponse,
  parseConfigJsonText,
  resolveMeTenantAuthContext,
  type ChannelSettingSafeDto
} from "./channelSettingsModel.js";

const lineRow: ChannelSettingSafeDto = {
  id: "cs-1",
  tenantId: "t1",
  channel: "LINE",
  enabled: true,
  displayName: "LINE OA",
  configJson: { channelId: "U1" },
  secretsConfigured: [
    { key: "channel_secret", configured: true, fingerprint: "abc123def456" },
    { key: "channel_access_token", configured: false, fingerprint: null }
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
};

test("parseChannelSettingsListResponse merges LINE FACEBOOK INSTAGRAM", () => {
  const r = parseChannelSettingsListResponse({ data: [lineRow] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.length, 3);
  assert.equal(r.data[0]!.channel, "LINE");
  assert.equal(r.data[1]!.channel, "FACEBOOK");
  assert.equal(r.data[2]!.channel, "INSTAGRAM");
  assert.equal(r.data[0]!.displayName, "LINE OA");
});

test("configured secrets expose fingerprint only in parsed dto", () => {
  const r = parseChannelSettingsListResponse({ data: [lineRow] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const secret = r.data[0]!.secretsConfigured.find((s) => s.key === "channel_secret");
  assert.equal(secret?.configured, true);
  assert.equal(secret?.fingerprint, "abc123def456");
  const serialized = JSON.stringify(r.data[0]);
  assert.equal(serialized.includes("super-secret-token"), false);
});

test("buildChannelPatchBody sends changed fields and secrets only", () => {
  const baseline = mergeListWithAllChannels([lineRow])[0]!;
  const draft = draftFromDto(baseline);
  draft.enabled = false;
  const built = buildChannelPatchBody(baseline, draft, { channel_access_token: "new-token-value" }, []);
  assert.equal(built.ok, true);
  if (!built.ok || built.body === null) return;
  assert.equal(built.body.enabled, false);
  assert.deepEqual(built.body.secrets, { channel_access_token: "new-token-value" });
  assert.equal(built.body.displayName, undefined);
});

test("buildChannelPatchBody sends clearSecretKeys", () => {
  const baseline = defaultChannelDto("FACEBOOK");
  const draft = draftFromDto(baseline);
  const built = buildChannelPatchBody(baseline, draft, {}, ["page_access_token"]);
  assert.equal(built.ok, true);
  if (!built.ok || built.body === null) return;
  assert.deepEqual(built.body.clearSecretKeys, ["page_access_token"]);
});

test("parseConfigJsonText blocks malformed JSON", () => {
  const r = parseConfigJsonText("{ not json");
  assert.equal(r.ok, false);
});

test("buildChannelPatchBody returns null when nothing changed", () => {
  const baseline = mergeListWithAllChannels([lineRow])[0]!;
  const draft = draftFromDto(baseline);
  const built = buildChannelPatchBody(baseline, draft, {}, []);
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
  assert.equal(headers.Authorization, "Bearer tok");
  assert.equal(headers["Content-Type"], "application/json");
});

test("resolveMeTenantAuthContext prefers me tenant for admin channel calls", () => {
  const ctx = resolveMeTenantAuthContext({
    baseUrl: "https://app.example",
    accessToken: "tok",
    sessionTenantId: "session-tenant",
    meTenantId: "me-tenant",
    requireMeTenant: true
  });
  assert.deepEqual(ctx, {
    baseUrl: "https://app.example",
    accessToken: "tok",
    tenantId: "me-tenant"
  });
});

test("resolveMeTenantAuthContext falls back to session tenant for /api/me", () => {
  const ctx = resolveMeTenantAuthContext({
    baseUrl: "https://app.example",
    accessToken: "tok",
    sessionTenantId: "session-tenant",
    meTenantId: null
  });
  assert.equal(ctx?.tenantId, "session-tenant");
});
