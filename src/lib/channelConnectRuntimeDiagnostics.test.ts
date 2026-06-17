import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelConnectResolverDiagnostics,
  buildFacebookOAuthOutboundFailureLogPayload
} from "./channelConnectRuntimeDiagnostics.js";

test("buildFacebookOAuthOutboundFailureLogPayload includes safe OAuth outbound fields only", () => {
  const payload = buildFacebookOAuthOutboundFailureLogPayload({
    diagnostics: buildChannelConnectResolverDiagnostics({
      code: "encryption_key_missing",
      provider: "FACEBOOK",
      mode: "DB_WITH_ENV_FALLBACK",
      connectionId: "507d5519-8f4f-4973-99f1-7b00af25279d",
      connectionStatus: "READY",
      fallbackReason: "encryption_key_missing"
    }),
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    providerPageId: "541846535686129",
    explicitChannelConnectionId: true,
    encryptionKeyConfigured: false
  });

  assert.equal(payload.event, "facebook_oauth_outbound_credential_failure");
  assert.equal(payload.diagnosticCode, "encryption_key_missing");
  assert.equal(payload.provider, "FACEBOOK");
  assert.equal(payload.runtimeMode, "DB_WITH_ENV_FALLBACK");
  assert.equal(payload.tenantId, "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f");
  assert.equal(payload.connectionId, "507d5519-8f4f-4973-99f1-7b00af25279d");
  assert.equal(payload.connectionStatus, "READY");
  assert.equal(payload.providerPageId, "541846535686129");
  assert.equal(payload.explicitChannelConnectionIdSupplied, true);
  assert.equal(payload.encryptionKeyConfigured, false);
  assert.equal(payload.oauthManaged, true);
  assert.equal(payload.blockLegacyFallback, true);
  assert.equal(JSON.stringify(payload).includes("EAAG"), false);
});
