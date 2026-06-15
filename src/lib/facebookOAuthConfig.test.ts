import test from "node:test";
import assert from "node:assert/strict";
import { readFacebookOAuthServerConfig, resolveFacebookOAuthAvailability } from "./facebookOAuthConfig.js";

const TEST_KEY = "a".repeat(64);

test("oauthAvailable is false when feature flag is off", () => {
  const config = readFacebookOAuthServerConfig({
    HUBCHAT_FACEBOOK_OAUTH_ENABLED: "false",
    META_APP_ID: "123",
    FACEBOOK_APP_SECRET: "secret",
    NEXT_PUBLIC_APP_BASE_URL: "https://example.com",
    HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resolveFacebookOAuthAvailability(config).oauthAvailable, false);
});

test("oauthAvailable is true when required server config is present", () => {
  const config = readFacebookOAuthServerConfig({
    HUBCHAT_FACEBOOK_OAUTH_ENABLED: "true",
    META_APP_ID: "1234567890",
    FACEBOOK_APP_SECRET: "secret",
    NEXT_PUBLIC_APP_BASE_URL: "https://smartkorp-hub-chat.vercel.app",
    META_GRAPH_VERSION: "v25.0",
    HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(resolveFacebookOAuthAvailability(config).oauthAvailable, true);
  assert.match(config.callbackUrl, /\/api\/channel-connect\/facebook\/oauth\/callback$/);
});
