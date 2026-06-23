import test from "node:test";
import assert from "node:assert/strict";
import {
  MetaPageCredentialFamilyMismatchError,
  MetaPageCredentialTokenShapeError
} from "./metaPageCredentialErrors.js";
import { META_PAGE_CREDENTIAL_FAMILIES } from "./metaPageCredentials.js";
import {
  assertMetaPageCredentialFamily,
  assertMetaPageFacebookLoginAccessTokenShape,
  isMetaPageCredentialFamily,
  isMetaPageCredentialResolvableStatus
} from "../lib/metaPageCredentialValidation.js";
import { assertMetaPageCredentialMetadataSafeForApi } from "../lib/metaPageCredentialPublicDto.js";

test("META_PAGE_FACEBOOK_LOGIN is the only supported credential family", () => {
  assert.deepEqual(META_PAGE_CREDENTIAL_FAMILIES, ["META_PAGE_FACEBOOK_LOGIN"]);
  assert.equal(isMetaPageCredentialFamily("META_PAGE_FACEBOOK_LOGIN"), true);
  assert.equal(isMetaPageCredentialFamily("INSTAGRAM_BUSINESS_LOGIN"), false);
});

test("unsupported credential family is rejected", () => {
  assert.throws(
    () => assertMetaPageCredentialFamily("INSTAGRAM_BUSINESS_LOGIN"),
    (err: unknown) => err instanceof MetaPageCredentialFamilyMismatchError
  );
});

test("IGA-shaped token input is rejected", () => {
  assert.throws(
    () => assertMetaPageFacebookLoginAccessTokenShape("IGARVfake-token-placeholder"),
    (err: unknown) => err instanceof MetaPageCredentialTokenShapeError
  );
  assert.throws(
    () => assertMetaPageFacebookLoginAccessTokenShape("IG_some_token"),
    (err: unknown) => err instanceof MetaPageCredentialTokenShapeError
  );
});

test("Facebook Page token shape is accepted", () => {
  assert.doesNotThrow(() =>
    assertMetaPageFacebookLoginAccessTokenShape("EAAfake-page-access-token-placeholder")
  );
});

test("only ACTIVE credentials are resolvable", () => {
  assert.equal(isMetaPageCredentialResolvableStatus("ACTIVE"), true);
  assert.equal(isMetaPageCredentialResolvableStatus("PENDING"), false);
  assert.equal(isMetaPageCredentialResolvableStatus("REVOKED"), false);
  assert.equal(isMetaPageCredentialResolvableStatus("ERROR"), false);
});

test("API metadata serialization excludes secret fields", () => {
  assert.doesNotThrow(() =>
    assertMetaPageCredentialMetadataSafeForApi({
      id: "cred-1",
      tokenFingerprint: "abc123",
      status: "ACTIVE"
    })
  );
  assert.throws(() =>
    assertMetaPageCredentialMetadataSafeForApi({
      encrypted_access_token: "v1:iv:cipher:tag"
    })
  );
  assert.throws(() =>
    assertMetaPageCredentialMetadataSafeForApi({
      accessToken: "secret"
    })
  );
});
