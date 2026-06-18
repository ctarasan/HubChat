import test from "node:test";
import assert from "node:assert/strict";
import {
  assertReauthorizationAccountBinding,
  assertTokenResponseIdentityMatchesMe,
  validateInstagramProfessionalIdentityRaw
} from "./instagramIdentityValidation.js";

test("validateInstagramProfessionalIdentityRaw accepts business account", () => {
  const identity = validateInstagramProfessionalIdentityRaw({
    userId: "17841400000000001",
    username: "brand.official",
    accountType: "BUSINESS"
  });
  assert.equal(String(identity.professionalAccountId), "17841400000000001");
  assert.equal(String(identity.username), "brand.official");
  assert.equal(identity.accountType, "BUSINESS");
});

test("validateInstagramProfessionalIdentityRaw maps MEDIA_CREATOR to CREATOR", () => {
  const identity = validateInstagramProfessionalIdentityRaw({
    userId: "17841400000000002",
    username: "creator.one",
    accountType: "MEDIA_CREATOR"
  });
  assert.equal(identity.accountType, "CREATOR");
});

test("validateInstagramProfessionalIdentityRaw rejects personal account type", () => {
  assert.throws(
    () =>
      validateInstagramProfessionalIdentityRaw({
        userId: "17841400000000003",
        username: "personal.user",
        accountType: "PERSONAL"
      }),
    /professional account/i
  );
});

test("assertTokenResponseIdentityMatchesMe rejects mismatch", () => {
  const identity = validateInstagramProfessionalIdentityRaw({
    userId: "17841400000000001",
    username: "brand.official",
    accountType: "BUSINESS"
  });
  assert.throws(
    () =>
      assertTokenResponseIdentityMatchesMe({
        tokenResponseUserId: "99999999999999999",
        verifiedIdentity: identity
      }),
    /does not match verified professional account/i
  );
});

test("assertReauthorizationAccountBinding rejects account switch", () => {
  const identity = validateInstagramProfessionalIdentityRaw({
    userId: "17841400000000001",
    username: "brand.official",
    accountType: "BUSINESS"
  });
  assert.throws(
    () =>
      assertReauthorizationAccountBinding({
        expectedProfessionalAccountId: "17841400000000099",
        verifiedIdentity: identity
      }),
    /cannot switch/i
  );
});
