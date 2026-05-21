import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import {
  classifyLineDbRuntimeFallbackReason,
  lineCredentialsFromRuntimeConfig,
  loadEnvLineCredentials,
  parseLineRuntimeConfigMode,
  resolveLineOutboundConfig
} from "./lineOutboundRuntimeConfig.js";

const envCreds = {
  LINE_CHANNEL_ACCESS_TOKEN: "env-line-token",
  LINE_CHANNEL_SECRET: "env-line-secret"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: "tenant-1",
  channel: "LINE",
  enabled: true,
  providerPageId: null,
  providerAccountName: null,
  secrets: { accessToken: "db-line-token", channelSecret: "db-line-secret" }
};

test("parseLineRuntimeConfigMode defaults to ENV_ONLY", () => {
  assert.equal(parseLineRuntimeConfigMode(undefined), "ENV_ONLY");
  assert.equal(parseLineRuntimeConfigMode(""), "ENV_ONLY");
  assert.equal(parseLineRuntimeConfigMode("db_with_env_fallback"), "DB_WITH_ENV_FALLBACK");
  assert.equal(parseLineRuntimeConfigMode("DB_ONLY"), "DB_ONLY");
});

test("ENV_ONLY uses env credentials only", async () => {
  const resolved = await resolveLineOutboundConfig({
    mode: "ENV_ONLY",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.credentials.channelAccessToken, "env-line-token");
});

test("DB_WITH_ENV_FALLBACK uses DB when runtime config is available", async () => {
  const resolved = await resolveLineOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.channelAccessToken, "db-line-token");
});

test("DB_WITH_ENV_FALLBACK falls back to env when DB runtime is missing", async () => {
  const resolved = await resolveLineOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => null,
    findChannelSetting: async () =>
      ({
        enabled: false,
        configured: false,
        status: "DISABLED"
      }) as ChannelSettingPublicDto
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.credentials.channelAccessToken, "env-line-token");
  assert.equal(resolved.fallbackReason, "disabled");
});

test("DB_WITH_ENV_FALLBACK falls back to env when channel is disabled", async () => {
  const resolved = await resolveLineOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => null,
    findChannelSetting: async () =>
      ({
        enabled: false,
        configured: true,
        status: "DISABLED"
      }) as ChannelSettingPublicDto
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.fallbackReason, "disabled");
});

test("DB_ONLY uses DB config when valid", async () => {
  const resolved = await resolveLineOutboundConfig({
    mode: "DB_ONLY",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.channelSecret, "db-line-secret");
});

test("DB_ONLY fails safely when DB config is missing", async () => {
  await assert.rejects(
    () =>
      resolveLineOutboundConfig({
        mode: "DB_ONLY",
        tenantId: "tenant-1",
        env: envCreds,
        getRuntimeConfig: async () => null
      }),
    (err: Error) => {
      assert.equal(err.message.includes("env-line-token"), false);
      assert.equal(err.message.includes("db-line-token"), false);
      return true;
    }
  );
});

test("DB_ONLY error messages do not echo env or db secret values", async () => {
  await assert.rejects(
    () =>
      resolveLineOutboundConfig({
        mode: "DB_ONLY",
        tenantId: "t1",
        env: envCreds,
        getRuntimeConfig: async () => null
      }),
    (err: Error) => {
      assert.equal(err.message.includes("env-line-token"), false);
      assert.equal(err.message.includes("env-line-secret"), false);
      return true;
    }
  );
});

test("classifyLineDbRuntimeFallbackReason maps public setting states", () => {
  assert.equal(classifyLineDbRuntimeFallbackReason(null), "not_configured");
  assert.equal(
    classifyLineDbRuntimeFallbackReason({ enabled: false, configured: false, status: "DISABLED" } as ChannelSettingPublicDto),
    "disabled"
  );
  assert.equal(
    classifyLineDbRuntimeFallbackReason({ enabled: true, configured: false, status: "NOT_CONFIGURED" } as ChannelSettingPublicDto),
    "not_configured"
  );
});

test("loadEnvLineCredentials returns null when env is incomplete", () => {
  assert.equal(loadEnvLineCredentials({ LINE_CHANNEL_ACCESS_TOKEN: "tok" }), null);
});
