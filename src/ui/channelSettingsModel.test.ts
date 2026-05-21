import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTestConnectionToView,
  buildChannelPatchBody,
  buildTenantAuthHeaders,
  channelPathParam,
  channelViewHasForbiddenSecretLeak,
  channelViewSerializationForAudit,
  defaultChannelView,
  draftFromView,
  mergeListWithAllChannels,
  parseChannelSettingRow,
  parseChannelSettingsListResponse,
  parseTestConnectionResponse,
  resolveMeTenantAuthContext,
  secretStateForField,
  testConnectionPath,
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

const masterLineLegacy = {
  id: "cs-1",
  tenantId: "t1",
  channel: "LINE",
  enabled: true,
  displayName: "LINE Main",
  configJson: { channelId: "U123" },
  secretsConfigured: [
    { key: "channel_secret", configured: true, fingerprint: "abc123def456" },
    { key: "channel_access_token", configured: false, fingerprint: null }
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
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

test("parseChannelSettingsListResponse supports full legacy G1 master row without crash", () => {
  const r = parseChannelSettingsListResponse({ data: [masterLineLegacy] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const line = r.data[0]!;
  assert.equal(line.channel, "LINE");
  assert.equal(line.enabled, true);
  assert.equal(line.legacyDisplayName, "LINE Main");
  assert.deepEqual(line.legacyConfigJson, { channelId: "U123" });
  assert.equal(line.status, "READY");
  assert.equal(secretStateForField(line, "channelSecret"), "SET");
  assert.equal(secretStateForField(line, "accessToken"), "EMPTY");
});

test("mixed G2 secretState and legacy secretsConfigured prefers G2 secretState", () => {
  const row = parseChannelSettingRow({
    channel: "LINE",
    enabled: true,
    configured: true,
    status: "ERROR",
    secretState: { accessToken: "SET", channelSecret: "EMPTY" },
    secretsConfigured: [{ key: "channel_secret", configured: true, fingerprint: "should-not-win" }],
    providerAccountName: "G2 Account",
    displayName: "Legacy Name"
  });
  assert.equal(row?.status, "ERROR");
  assert.equal(row?.providerAccountName, "G2 Account");
  assert.equal(row?.legacyDisplayName, undefined);
  assert.equal(secretStateForField(row!, "channelSecret"), "EMPTY");
  assert.equal(secretStateForField(row!, "accessToken"), "SET");
});

test("mixed G2 status wins over legacy enabled/configured derivation", () => {
  const row = parseChannelSettingRow({
    channel: "FACEBOOK",
    enabled: false,
    configured: false,
    status: "NOT_CONFIGURED",
    secretState: { accessToken: "EMPTY", appSecret: "EMPTY", verifyToken: "EMPTY" }
  });
  assert.equal(row?.status, "NOT_CONFIGURED");
});

test("legacy row never leaks fingerprint or raw secret fields into parsed view", () => {
  const row = parseChannelSettingRow({
    ...masterLineLegacy,
    secret_value: "super-secret-token",
    channel_access_token: "raw-token-should-not-appear"
  });
  assert.ok(row);
  const serialized = channelViewSerializationForAudit(row!);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("raw-token-should-not-appear"), false);
  assert.equal(serialized.includes("abc123def456"), false);
  assert.equal(serialized.includes("fingerprint"), false);
  assert.equal(channelViewHasForbiddenSecretLeak(row!), false);
});

test("accidental secret-like keys on API row do not appear in view serialization", () => {
  const row = parseChannelSettingRow({
    channel: "INSTAGRAM",
    enabled: true,
    status: "READY",
    secretState: { accessToken: "SET", verifyToken: "EMPTY", appSecret: "EMPTY" },
    secrets: { access_token: "must-not-leak" },
    secret_json: { access_token: "nope" }
  });
  assert.ok(row);
  const serialized = channelViewSerializationForAudit(row!);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("nope"), false);
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

test("parseTestConnectionResponse accepts top-level and data-wrapped payloads", () => {
  const top = parseTestConnectionResponse({
    channel: "LINE",
    ok: true,
    status: "READY",
    message: "LINE connection verified.",
    lastVerifiedAt: "2026-05-21T10:00:00.000Z",
    lastError: null
  });
  assert.equal(top.ok, true);
  if (!top.ok) return;
  assert.equal(top.data.status, "READY");
  assert.equal(top.data.message, "LINE connection verified.");

  const wrapped = parseTestConnectionResponse({
    data: {
      channel: "INSTAGRAM",
      ok: false,
      status: "ERROR",
      message: "Token invalid",
      lastVerifiedAt: null,
      lastError: "Invalid OAuth token"
    }
  });
  assert.equal(wrapped.ok, true);
  if (!wrapped.ok) return;
  assert.equal(wrapped.data.status, "ERROR");
  assert.equal(wrapped.data.lastError, "Invalid OAuth token");
});

test("parseTestConnectionResponse sanitizes secret-like text in message", () => {
  const r = parseTestConnectionResponse({
    channel: "LINE",
    ok: false,
    status: "ERROR",
    message: "Failed: secret_json leak",
    lastVerifiedAt: null,
    lastError: "Bearer abc.def.ghi"
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.message.includes("secret_json"), false);
  assert.equal(r.data.lastError?.includes("Bearer"), false);
});

test("applyTestConnectionToView updates status and verification fields on success", () => {
  const view = defaultChannelView("FACEBOOK");
  const updated = applyTestConnectionToView(view, {
    channel: "FACEBOOK",
    ok: true,
    status: "READY",
    message: "OK",
    lastVerifiedAt: "2026-05-21T12:00:00.000Z",
    lastError: null
  });
  assert.equal(updated.status, "READY");
  assert.equal(updated.configured, true);
  assert.equal(updated.lastVerifiedAt, "2026-05-21T12:00:00.000Z");
  assert.equal(updated.lastError, null);
});

test("applyTestConnectionToView updates status and lastError on failure", () => {
  const view = { ...defaultChannelView("LINE"), status: "READY" as const, lastError: null };
  const updated = applyTestConnectionToView(view, {
    channel: "LINE",
    ok: false,
    status: "ERROR",
    message: "Webhook unreachable",
    lastVerifiedAt: null,
    lastError: "Connection timeout"
  });
  assert.equal(updated.status, "ERROR");
  assert.equal(updated.lastError, "Connection timeout");
});

test("testConnectionPath uses lowercase channel segment", () => {
  assert.equal(testConnectionPath("LINE"), "/api/channel-settings/line/test-connection");
  assert.equal(testConnectionPath("INSTAGRAM"), "/api/channel-settings/instagram/test-connection");
});
