import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import {
  classifyFacebookDbRuntimeFallbackReason,
  facebookCredentialsFromRuntimeConfig,
  loadEnvFacebookCredentials,
  parseFacebookRuntimeConfigMode,
  resolveFacebookOutboundConfig
} from "./facebookOutboundRuntimeConfig.js";

const envCreds = {
  FACEBOOK_PAGE_ACCESS_TOKEN: "env-page-token",
  FACEBOOK_PAGE_ID: "env-page-id"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: "tenant-1",
  channel: "FACEBOOK",
  enabled: true,
  providerPageId: "db-page-id",
  providerAccountName: "Page Name",
  secrets: {
    accessToken: "db-page-token",
    appSecret: "db-app-secret",
    verifyToken: "db-verify-token"
  }
};

test("parseFacebookRuntimeConfigMode defaults to ENV_ONLY", () => {
  assert.equal(parseFacebookRuntimeConfigMode(undefined), "ENV_ONLY");
  assert.equal(parseFacebookRuntimeConfigMode("db_with_env_fallback"), "DB_WITH_ENV_FALLBACK");
});

test("ENV_ONLY uses env credentials only", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "ENV_ONLY",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.credentials.pageAccessToken, "env-page-token");
  assert.equal(resolved.credentials.providerPageId, "env-page-id");
});

test("DB_WITH_ENV_FALLBACK uses DB when runtime config is available", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.pageAccessToken, "db-page-token");
  assert.equal(resolved.credentials.providerPageId, "db-page-id");
});

test("DB_WITH_ENV_FALLBACK falls back to env when DB runtime is missing", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => null,
    findChannelSetting: async () =>
      ({ enabled: false, configured: false, status: "DISABLED" }) as ChannelSettingPublicDto
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.fallbackReason, "disabled");
});

test("DB_WITH_ENV_FALLBACK falls back to env when channel is disabled", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => null,
    findChannelSetting: async () =>
      ({ enabled: false, configured: true, status: "DISABLED" }) as ChannelSettingPublicDto
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.fallbackReason, "disabled");
});

test("DB_WITH_ENV_FALLBACK falls back to env when channel has ERROR status", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => null,
    findChannelSetting: async () =>
      ({ enabled: true, configured: true, status: "ERROR" }) as ChannelSettingPublicDto
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.fallbackReason, "error_state");
});

test("DB_ONLY uses DB config when valid", async () => {
  const resolved = await resolveFacebookOutboundConfig({
    mode: "DB_ONLY",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "db");
});

test("DB_ONLY fails safely without leaking secrets", async () => {
  await assert.rejects(
    () =>
      resolveFacebookOutboundConfig({
        mode: "DB_ONLY",
        tenantId: "tenant-1",
        env: envCreds,
        getRuntimeConfig: async () => null
      }),
    (err: Error) => {
      assert.equal(err.message.includes("env-page-token"), false);
      assert.equal(err.message.includes("db-page-token"), false);
      assert.equal(err.message.includes("db-app-secret"), false);
      return true;
    }
  );
});

test("facebookCredentialsFromRuntimeConfig requires access token", () => {
  assert.equal(
    facebookCredentialsFromRuntimeConfig(
      { ...dbRuntime, secrets: { accessToken: "", appSecret: "x", verifyToken: "y" } },
      "v25.0"
    ),
    null
  );
  assert.equal(loadEnvFacebookCredentials({}), null);
});
