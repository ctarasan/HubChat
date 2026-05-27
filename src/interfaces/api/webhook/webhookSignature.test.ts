import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  computeLineWebhookSignature,
  computeMetaHubSignature256,
  parseMetaHubSignature256,
  resolveMetaAppSecret,
  verifyLineWebhookSignature,
  verifyMetaHubSignature256,
  WEBHOOK_SIGNATURE_MISCONFIGURED,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";

test("computeLineWebhookSignature matches LINE HMAC-SHA256 base64", () => {
  const body = '{"events":[]}';
  const sig = computeLineWebhookSignature("channel-secret", body);
  const expected = createHmac("sha256", "channel-secret").update(body, "utf8").digest("base64");
  assert.equal(sig, expected);
});

test("verifyLineWebhookSignature accepts valid signature", () => {
  const rawBody = '{"events":[{"type":"message"}]}';
  const secret = "line-secret";
  const signature = computeLineWebhookSignature(secret, rawBody);
  const result = verifyLineWebhookSignature({
    channelSecret: secret,
    signatureHeader: signature,
    rawBody
  });
  assert.equal(result.ok, true);
});

test("verifyLineWebhookSignature rejects missing and invalid signatures", () => {
  const rawBody = "{}";
  const missing = verifyLineWebhookSignature({ channelSecret: "s", signatureHeader: null, rawBody });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(
    verifyLineWebhookSignature({ channelSecret: "s", signatureHeader: "bad", rawBody }).ok,
    false
  );
  const misconfigured = verifyLineWebhookSignature({
    channelSecret: undefined,
    signatureHeader: "x",
    rawBody
  });
  assert.equal(misconfigured.ok, false);
  if (!misconfigured.ok) assert.equal(misconfigured.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
});

test("parseMetaHubSignature256 parses sha256 hex and rejects malformed values", () => {
  const digest = createHmac("sha256", "meta").update("body", "utf8").digest("hex");
  assert.deepEqual(parseMetaHubSignature256(`sha256=${digest}`), Buffer.from(digest, "hex"));
  assert.equal(parseMetaHubSignature256("sha256=not-hex"), null);
  assert.equal(parseMetaHubSignature256("sha256=abc"), null);
  assert.equal(parseMetaHubSignature256("invalid"), null);
});

test("verifyMetaHubSignature256 accepts valid signature", () => {
  const rawBody = '{"object":"page","entry":[]}';
  const secret = "meta-app-secret";
  const digest = computeMetaHubSignature256(secret, rawBody).toString("hex");
  const result = verifyMetaHubSignature256({
    appSecret: secret,
    signatureHeader: `sha256=${digest}`,
    rawBody
  });
  assert.equal(result.ok, true);
});

test("verifyMetaHubSignature256 rejects missing secret and invalid signature", () => {
  const rawBody = "{}";
  const misconfigured = verifyMetaHubSignature256({
    appSecret: undefined,
    signatureHeader: "sha256=aa",
    rawBody
  });
  assert.equal(misconfigured.ok, false);
  if (!misconfigured.ok) assert.equal(misconfigured.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
  const missing = verifyMetaHubSignature256({ appSecret: "s", signatureHeader: null, rawBody });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(
    verifyMetaHubSignature256({ appSecret: "s", signatureHeader: "sha256=deadbeef", rawBody }).ok,
    false
  );
});

test("resolveMetaAppSecret prefers FACEBOOK_APP_SECRET then META_APP_SECRET then INSTAGRAM_APP_SECRET", () => {
  assert.equal(
    resolveMetaAppSecret({ FACEBOOK_APP_SECRET: " fb ", META_APP_SECRET: "meta", INSTAGRAM_APP_SECRET: "ig" }),
    "fb"
  );
  assert.equal(resolveMetaAppSecret({ META_APP_SECRET: "meta", INSTAGRAM_APP_SECRET: "ig" }), "meta");
  assert.equal(resolveMetaAppSecret({ INSTAGRAM_APP_SECRET: "ig" }), "ig");
});
