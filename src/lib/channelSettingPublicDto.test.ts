import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSecretState,
  isChannelConfigured,
  resolveChannelRuntimeConfig,
  resolveChannelStatus,
  toChannelSettingPublicDto
} from "./channelSettingPublicDto.js";
import { fingerprintSecretValue } from "./channelSettingSecrets.js";

const baseRow = {
  channel: "LINE",
  enabled: true,
  display_name: "LINE Main",
  config_json: { providerPageId: "page-1" },
  secret_fingerprint_json: {} as Record<string, unknown>,
  secret_json: {} as Record<string, unknown>,
  updated_at: "2026-01-02T00:00:00.000Z"
};

test("toChannelSettingPublicDto never includes raw secrets", () => {
  const fp = fingerprintSecretValue("super-secret-token");
  const dto = toChannelSettingPublicDto({
    ...baseRow,
    secret_fingerprint_json: { channel_access_token: fp },
    secret_json: { channel_access_token: "super-secret-token" }
  });
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(dto.secretState.accessToken, "SET");
  assert.equal(dto.secretState.channelSecret, "EMPTY");
  assert.equal(dto.configured, false);
  assert.equal(dto.status, "NOT_CONFIGURED");
});

test("resolveChannelStatus maps enabled/configured/error", () => {
  assert.equal(resolveChannelStatus(false, true, null), "DISABLED");
  assert.equal(resolveChannelStatus(true, false, null), "NOT_CONFIGURED");
  assert.equal(resolveChannelStatus(true, true, "boom"), "ERROR");
  assert.equal(resolveChannelStatus(true, true, null), "READY");
});

test("resolveChannelRuntimeConfig returns null when disabled", () => {
  const cfg = resolveChannelRuntimeConfig("tenant-1", { ...baseRow, enabled: false });
  assert.equal(cfg, null);
});

test("resolveChannelRuntimeConfig returns null when secrets incomplete", () => {
  const fp = fingerprintSecretValue("only-token");
  const cfg = resolveChannelRuntimeConfig("tenant-1", {
    ...baseRow,
    secret_fingerprint_json: { channel_access_token: fp },
    secret_json: { channel_access_token: "only-token" }
  });
  assert.equal(cfg, null);
});

test("resolveChannelRuntimeConfig returns secrets server-side when ready", () => {
  const tokenFp = fingerprintSecretValue("line-token-value");
  const secretFp = fingerprintSecretValue("line-secret-value");
  const cfg = resolveChannelRuntimeConfig("tenant-1", {
    ...baseRow,
    secret_fingerprint_json: {
      channel_access_token: tokenFp,
      channel_secret: secretFp
    },
    secret_json: {
      channel_access_token: "line-token-value",
      channel_secret: "line-secret-value"
    }
  });
  assert.ok(cfg);
  assert.equal(cfg!.tenantId, "tenant-1");
  assert.equal(cfg!.secrets.accessToken, "line-token-value");
  assert.equal(cfg!.secrets.channelSecret, "line-secret-value");
});

test("isChannelConfigured requires channel-specific secrets", () => {
  const lineState = buildSecretState("LINE", {
    channel_access_token: "fp1",
    channel_secret: "fp2"
  });
  assert.equal(isChannelConfigured("LINE", lineState), true);
});
