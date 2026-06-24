import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMetaPageExpiryAcceptable,
  META_PAGE_CREDENTIAL_NEAR_EXPIRY_HORIZON_MS,
  normalizeMetaPageExpiryTimestamps
} from "./metaPageCredentialExpiryPolicy.js";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";

test("normalizeMetaPageExpiryTimestamps parses unix seconds", () => {
  const ts = normalizeMetaPageExpiryTimestamps({
    expiresAt: 2_000_000_000,
    dataAccessExpiresAt: 2_000_000_100
  });
  assert.ok(ts.tokenExpiresAt instanceof Date);
  assert.ok(ts.dataAccessExpiresAt instanceof Date);
});

test("expired token rejected", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  assert.throws(
    () =>
      assertMetaPageExpiryAcceptable(
        { tokenExpiresAt: new Date("2029-01-01T00:00:00.000Z"), dataAccessExpiresAt: null },
        now
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_TOKEN_EXPIRED"
  );
});

test("near-expiry token rejected", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const near = new Date(now.getTime() + META_PAGE_CREDENTIAL_NEAR_EXPIRY_HORIZON_MS - 60_000);
  assert.throws(
    () => assertMetaPageExpiryAcceptable({ tokenExpiresAt: near, dataAccessExpiresAt: null }, now),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_TOKEN_EXPIRY_TOO_NEAR"
  );
});

test("valid far-future expiry passes", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const far = new Date(now.getTime() + META_PAGE_CREDENTIAL_NEAR_EXPIRY_HORIZON_MS + 86_400_000);
  assert.doesNotThrow(() =>
    assertMetaPageExpiryAcceptable({ tokenExpiresAt: far, dataAccessExpiresAt: far }, now)
  );
});
