import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptChannelCredentialCiphertext,
  encryptChannelCredentialPlaintext,
  isChannelCredentialEncryptionKeyConfigured,
  isInvalidCredentialEncryptionKeyFormat,
  resolveChannelCredentialEncryptionKey
} from "./channelCredentialEncryption.js";
import { parseWorkerEnv } from "./workerEnv.js";

const TEST_KEY = "0123456789abcdef".repeat(4);
const OTHER_KEY = "fedcba9876543210".repeat(4);

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

test("resolveChannelCredentialEncryptionKey prefers constructor injection over env", () => {
  const resolved = resolveChannelCredentialEncryptionKey({
    constructorKey: TEST_KEY,
    env: { HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: OTHER_KEY }
  });
  assert.equal(resolved.status, "configured");
  if (resolved.status === "configured") {
    assert.equal(resolved.source, "constructor");
    assert.equal(resolved.keyMaterial, TEST_KEY);
  }
});

test("resolveChannelCredentialEncryptionKey reads env before process.env fallback", () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = OTHER_KEY;
  try {
    const resolved = resolveChannelCredentialEncryptionKey({
      env: { HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY }
    });
    assert.equal(resolved.status, "configured");
    if (resolved.status === "configured") {
      assert.equal(resolved.source, "env");
      assert.equal(resolved.keyMaterial, TEST_KEY);
    }
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("resolveChannelCredentialEncryptionKey falls back to process.env when parsed env omits key", () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  try {
    const parsed = parseWorkerEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
    } as unknown as NodeJS.ProcessEnv);
    const resolved = resolveChannelCredentialEncryptionKey({ env: parsed });
    assert.equal(resolved.status, "configured");
    if (resolved.status === "configured") {
      assert.equal(resolved.source, "process_env");
      assert.equal(resolved.keyMaterial, TEST_KEY);
    }
    assert.equal(isChannelCredentialEncryptionKeyConfigured(parsed), true);
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("parseWorkerEnv preserves HUBCHAT_CREDENTIAL_ENCRYPTION_KEY when present", () => {
  const parsed = parseWorkerEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: TEST_KEY
  } as unknown as NodeJS.ProcessEnv);
  const resolved = resolveChannelCredentialEncryptionKey({ env: parsed });
  assert.equal(resolved.status, "configured");
  if (resolved.status === "configured") {
    assert.equal(resolved.source, "env");
  }
});

test("resolveChannelCredentialEncryptionKey reports missing when no key is available", () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  try {
    const parsed = parseWorkerEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(resolveChannelCredentialEncryptionKey({ env: parsed }).status, "missing");
    assert.equal(isChannelCredentialEncryptionKeyConfigured(parsed), false);
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("unresolved Railway reference syntax is invalid_format not missing", () => {
  assert.equal(isInvalidCredentialEncryptionKeyFormat("${{ secrets.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY }}"), true);
  const resolved = resolveChannelCredentialEncryptionKey({
    env: { HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "${{ secrets.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY }}" }
  });
  assert.equal(resolved.status, "invalid_format");
});

test("ciphertext encrypted with another key fails decrypt not missing-key precheck", () => {
  const encrypted = encryptChannelCredentialPlaintext("oauth-page-token", TEST_KEY);
  assert.throws(() => decryptChannelCredentialCiphertext(encrypted, OTHER_KEY));
});
