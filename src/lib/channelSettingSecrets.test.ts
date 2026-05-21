import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSecretsConfiguredMeta,
  fingerprintSecretValue,
  mergeChannelSecrets,
  stripSecretFields,
  validateSecretsPatch
} from "./channelSettingSecrets.js";

test("fingerprintSecretValue is deterministic and does not echo secret", () => {
  const fp = fingerprintSecretValue("test-channel-secret-value");
  assert.equal(fp.length, 12);
  assert.equal(fp.includes("test-channel"), false);
  assert.equal(fingerprintSecretValue("test-channel-secret-value"), fp);
});

test("mergeChannelSecrets stores fingerprints not raw in returned secretJson for server only", () => {
  const { secretJson, secretFingerprintJson } = mergeChannelSecrets(
    "LINE",
    {},
    { channel_secret: "line-secret-abc", channel_access_token: "line-token-xyz" },
    undefined
  );
  assert.equal(secretJson.channel_secret, "line-secret-abc");
  assert.equal(secretFingerprintJson.channel_secret?.length, 12);
  assert.notEqual(secretFingerprintJson.channel_secret, "line-secret-abc");
});

test("validateSecretsPatch rejects unknown and blocked keys", () => {
  assert.throws(() => validateSecretsPatch("LINE", { unknown_key: "x" }, undefined));
  assert.throws(() => validateSecretsPatch("FACEBOOK", { rawWebhook: "x" }, undefined));
});

test("mergeChannelSecrets ignores blank patch values and preserves existing", () => {
  const { secretJson } = mergeChannelSecrets(
    "LINE",
    { channel_secret: "keep-secret" },
    { channel_secret: "   ", channel_access_token: "" },
    undefined
  );
  assert.equal(secretJson.channel_secret, "keep-secret");
  assert.equal(secretJson.channel_access_token, undefined);
});

test("buildSecretsConfiguredMeta lists allowed keys with configured flag", () => {
  const fp = fingerprintSecretValue("instagram-token-value");
  const meta = buildSecretsConfiguredMeta("INSTAGRAM", { access_token: fp });
  const access = meta.find((m) => m.key === "access_token");
  assert.ok(access);
  assert.equal(access?.configured, true);
  assert.equal(access?.fingerprint, fp);
  assert.equal(access?.fingerprint?.includes("instagram"), false);
  const verify = meta.find((m) => m.key === "verify_token");
  assert.equal(verify?.configured, false);
});

test("stripSecretFields removes secret_json from objects", () => {
  const safe = stripSecretFields({
    id: "1",
    secret_json: { token: "hidden" },
    enabled: true
  });
  assert.equal("secret_json" in safe, false);
  assert.equal(safe.id, "1");
});
