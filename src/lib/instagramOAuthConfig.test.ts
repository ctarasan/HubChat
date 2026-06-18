import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstagramOAuthCallbackUrl,
  instagramOAuthConnectScopes,
  readInstagramOAuthServerConfig,
  resolveInstagramOAuthConnectAvailability
} from "./instagramOAuthConfig.js";

test("readInstagramOAuthServerConfig builds callback under channel-connect prefix", () => {
  const config = readInstagramOAuthServerConfig({
    HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "true",
    META_APP_ID: "123",
    FACEBOOK_APP_SECRET: "secret",
    NEXT_PUBLIC_APP_BASE_URL: "https://example.test",
    HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64)
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(
    config.callbackUrl,
    "https://example.test/api/channel-connect/instagram/oauth/callback"
  );
});

test("connect availability requires flag, secrets, and encryption key", () => {
  const available = resolveInstagramOAuthConnectAvailability(
    readInstagramOAuthServerConfig({
      HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "true",
      META_APP_ID: "123",
      FACEBOOK_APP_SECRET: "secret",
      NEXT_PUBLIC_APP_BASE_URL: "https://example.test",
      HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64)
    } as unknown as NodeJS.ProcessEnv)
  );
  assert.equal(available.connectAvailable, true);

  const disabled = resolveInstagramOAuthConnectAvailability(
    readInstagramOAuthServerConfig({
      META_APP_ID: "123",
      FACEBOOK_APP_SECRET: "secret",
      HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64)
    } as unknown as NodeJS.ProcessEnv)
  );
  assert.equal(disabled.connectAvailable, false);
});

test("instagramOAuthConnectScopes returns approved server-controlled scopes only", () => {
  assert.deepEqual(instagramOAuthConnectScopes(), [
    "instagram_business_basic",
    "instagram_business_manage_messages"
  ]);
});

test("buildInstagramOAuthCallbackUrl normalizes trailing slash", () => {
  assert.equal(
    buildInstagramOAuthCallbackUrl("https://example.test/"),
    "https://example.test/api/channel-connect/instagram/oauth/callback"
  );
});
