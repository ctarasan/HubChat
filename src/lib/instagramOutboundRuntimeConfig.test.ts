import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import {
  classifyInstagramDbRuntimeFallbackReason,
  instagramCredentialsFromRuntimeConfig,
  loadEnvInstagramCredentials,
  parseInstagramRuntimeConfigMode,
  resolveInstagramOutboundConfig
} from "./instagramOutboundRuntimeConfig.js";

function fakePageAccessToken(suffix: string): string {
  return `EA${suffix.repeat(78)}`;
}

const envCreds = {
  FACEBOOK_PAGE_ACCESS_TOKEN: fakePageAccessToken("E"),
  FACEBOOK_PAGE_ID: "env-page-id"
};

const dbRuntime: ChannelRuntimeConfig = {
  tenantId: "tenant-1",
  channel: "INSTAGRAM",
  enabled: true,
  providerPageId: "db-page-id",
  providerAccountName: "IG Account",
  secrets: {
    accessToken: fakePageAccessToken("D"),
    appSecret: "db-app-secret",
    verifyToken: "db-verify-token"
  }
};

test("parseInstagramRuntimeConfigMode defaults to ENV_ONLY", () => {
  assert.equal(parseInstagramRuntimeConfigMode(undefined), "ENV_ONLY");
  assert.equal(parseInstagramRuntimeConfigMode("db_with_env_fallback"), "DB_WITH_ENV_FALLBACK");
  assert.equal(parseInstagramRuntimeConfigMode("db_only"), "DB_ONLY");
});

test("ENV_ONLY uses env credentials only", async () => {
  const resolved = await resolveInstagramOutboundConfig({
    mode: "ENV_ONLY",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "env");
  assert.equal(resolved.credentials.accessToken, fakePageAccessToken("E"));
  assert.equal(resolved.credentials.pageId, "env-page-id");
});

test("loadEnvInstagramCredentials prefers FACEBOOK_PAGE_ACCESS_TOKEN then INSTAGRAM_ACCESS_TOKEN", () => {
  const fromFacebook = loadEnvInstagramCredentials({
    FACEBOOK_PAGE_ACCESS_TOKEN: fakePageAccessToken("F"),
    FACEBOOK_PAGE_ID: "page-1"
  });
  assert.ok(fromFacebook);
  assert.equal(fromFacebook.accessToken, fakePageAccessToken("F"));

  const fromInstagram = loadEnvInstagramCredentials({
    INSTAGRAM_ACCESS_TOKEN: fakePageAccessToken("I"),
    INSTAGRAM_PAGE_ID: "page-2"
  });
  assert.ok(fromInstagram);
  assert.equal(fromInstagram.accessToken, fakePageAccessToken("I"));
});

test("DB_WITH_ENV_FALLBACK uses DB when runtime config is available", async () => {
  const resolved = await resolveInstagramOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: "tenant-1",
    env: envCreds,
    getRuntimeConfig: async () => dbRuntime
  });
  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.accessToken, fakePageAccessToken("D"));
  assert.equal(resolved.credentials.pageId, "db-page-id");
});

test("DB_WITH_ENV_FALLBACK falls back to env when DB runtime is missing", async () => {
  const resolved = await resolveInstagramOutboundConfig({
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

test("DB_WITH_ENV_FALLBACK falls back to env when channel has ERROR status", async () => {
  const resolved = await resolveInstagramOutboundConfig({
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
  const resolved = await resolveInstagramOutboundConfig({
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
      resolveInstagramOutboundConfig({
        mode: "DB_ONLY",
        tenantId: "tenant-1",
        env: envCreds,
        getRuntimeConfig: async () => null
      }),
    (err: Error) => {
      assert.equal(err.message.includes(fakePageAccessToken("E")), false);
      assert.equal(err.message.includes(fakePageAccessToken("D")), false);
      assert.equal(err.message.includes("db-app-secret"), false);
      return true;
    }
  );
});

test("instagramCredentialsFromRuntimeConfig requires access token and page id", () => {
  assert.equal(
    instagramCredentialsFromRuntimeConfig(
      { ...dbRuntime, secrets: { accessToken: "", appSecret: "x", verifyToken: "y" } },
      "v25.0"
    ),
    null
  );
  assert.equal(
    instagramCredentialsFromRuntimeConfig({ ...dbRuntime, providerPageId: "" }, "v25.0"),
    null
  );
  assert.equal(loadEnvInstagramCredentials({}), null);
  assert.equal(classifyInstagramDbRuntimeFallbackReason(null), "not_configured");
});
