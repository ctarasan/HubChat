import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext
} from "./channelCredentialEncryption.js";

const TEST_KEY = "0123456789abcdef".repeat(4);

test("encrypt and decrypt round-trip credential", () => {
  const plaintext = "fake-line-channel-access-token-placeholder";
  const encrypted = encryptChannelCredentialPlaintext(plaintext, TEST_KEY);
  assert.equal(encrypted.startsWith("v1:"), true);
  assert.equal(encrypted.includes(plaintext), false);
  const decrypted = decryptChannelCredentialCiphertext(encrypted, TEST_KEY);
  assert.equal(decrypted, plaintext);
});

test("decrypt rejects malformed ciphertext", () => {
  assert.throws(
    () => decryptChannelCredentialCiphertext("not-valid", TEST_KEY),
    /Unsupported credential ciphertext format/
  );
});

test("encrypt rejects empty plaintext", () => {
  assert.throws(() => encryptChannelCredentialPlaintext("   ", TEST_KEY), /cannot be empty/);
});
