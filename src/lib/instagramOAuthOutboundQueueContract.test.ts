import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNoOAuthEnvironmentFallback,
  isConnectionBoundInstagramOAuthBinding,
  parseInstagramCredentialBindingFromPayload,
  serializeInstagramCredentialBindingForQueue,
  toSafeInstagramCredentialBindingJson
} from "./instagramOAuthOutboundQueueContract.js";
import { InstagramOAuthConfigurationError } from "./instagramOAuthResolverErrors.js";

const CONNECTION = "cc111111-1111-4111-8111-111111111111";

test("legacy payload without binding parses as null", () => {
  const binding = parseInstagramCredentialBindingFromPayload({
    tenantId: "t1",
    messageId: "m1",
    channel: "INSTAGRAM"
  });
  assert.equal(binding, null);
});

test("connection-bound payload accepted", () => {
  const binding = parseInstagramCredentialBindingFromPayload({
    instagramCredentialBinding: {
      mode: "CONNECTION_BOUND",
      contractVersion: 1,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      deliveryPath: "DATABASE_ONLY",
      channelConnectionId: CONNECTION
    }
  });
  assert.equal(binding?.mode, "CONNECTION_BOUND");
  if (binding?.mode === "CONNECTION_BOUND") {
    assert.equal(binding.channelConnectionId, CONNECTION);
  }
});

test("legacy binding mode accepted", () => {
  const binding = parseInstagramCredentialBindingFromPayload({
    instagramCredentialBinding: { mode: "LEGACY" }
  });
  assert.deepEqual(binding, { mode: "LEGACY" });
});

test("OAuth plus environment fallback rejected", () => {
  assert.throws(
    () =>
      assertNoOAuthEnvironmentFallback({
        mode: "CONNECTION_BOUND",
        contractVersion: 1,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        deliveryPath: "ENVIRONMENT_FALLBACK" as "DATABASE_ONLY",
        channelConnectionId: CONNECTION
      }),
    InstagramOAuthConfigurationError
  );
});

test("prohibited token field in payload rejected", () => {
  assert.throws(
    () =>
      parseInstagramCredentialBindingFromPayload({
        accessToken: "test-instagram-access-token"
      }),
    InstagramOAuthConfigurationError
  );
});

test("serialized queue binding excludes token material", () => {
  const json = toSafeInstagramCredentialBindingJson({
    mode: "CONNECTION_BOUND",
    contractVersion: 1,
    provider: "INSTAGRAM",
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    deliveryPath: "DATABASE_ONLY",
    channelConnectionId: CONNECTION
  });
  assert.equal(JSON.stringify(json).includes("accessToken"), false);
  assert.equal(JSON.stringify(json).includes("ciphertext"), false);
  assert.equal(json?.channelConnectionId, CONNECTION);
});

test("serialize strips extra fields", () => {
  const serialized = serializeInstagramCredentialBindingForQueue({
    mode: "CONNECTION_BOUND",
    contractVersion: 1,
    provider: "INSTAGRAM",
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    deliveryPath: "DATABASE_ONLY",
    channelConnectionId: CONNECTION
  });
  assert.deepEqual(Object.keys(serialized).sort(), [
    "authFamily",
    "channelConnectionId",
    "contractVersion",
    "deliveryPath",
    "mode",
    "provider"
  ]);
});

test("invalid provider combination rejected", () => {
  assert.throws(
    () =>
      parseInstagramCredentialBindingFromPayload({
        instagramCredentialBinding: {
          mode: "CONNECTION_BOUND",
          contractVersion: 1,
          provider: "FACEBOOK",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          deliveryPath: "DATABASE_ONLY",
          channelConnectionId: CONNECTION
        }
      }),
    InstagramOAuthConfigurationError
  );
});

test("isConnectionBoundInstagramOAuthBinding detects connection-bound mode", () => {
  assert.equal(
    isConnectionBoundInstagramOAuthBinding({
      mode: "CONNECTION_BOUND",
      contractVersion: 1,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      deliveryPath: "DATABASE_ONLY",
      channelConnectionId: CONNECTION
    }),
    true
  );
  assert.equal(isConnectionBoundInstagramOAuthBinding({ mode: "LEGACY" }), false);
  assert.equal(isConnectionBoundInstagramOAuthBinding(null), false);
});
