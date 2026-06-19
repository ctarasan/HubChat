import test from "node:test";
import assert from "node:assert/strict";
import {
  validateInstagramOAuthTextMessage,
  validateInstagramOAuthTextRecipient
} from "./instagramOAuthTextDeliveryValidation.js";

test("validateInstagramOAuthTextMessage rejects blank text", () => {
  assert.throws(() => validateInstagramOAuthTextMessage({ messageText: "   " }), /empty/);
});

test("validateInstagramOAuthTextMessage rejects text over 1000 UTF-8 bytes", () => {
  assert.throws(
    () => validateInstagramOAuthTextMessage({ messageText: "ก".repeat(1001) }),
    /1000 bytes/
  );
});

test("validateInstagramOAuthTextRecipient rejects username", () => {
  assert.throws(
    () =>
      validateInstagramOAuthTextRecipient({
        recipientMessagingScopedUserId: "@brand_user"
      }),
    /username/
  );
});

test("validateInstagramOAuthTextRecipient rejects non-numeric IGSID", () => {
  assert.throws(
    () =>
      validateInstagramOAuthTextRecipient({
        recipientMessagingScopedUserId: "abc123"
      }),
    /numeric/
  );
});

test("validateInstagramOAuthTextRecipient rejects sender professional account ID", () => {
  assert.throws(
    () =>
      validateInstagramOAuthTextRecipient({
        recipientMessagingScopedUserId: "17841400000000000",
        senderProfessionalAccountId: "17841400000000000"
      }),
    /professional account sender/
  );
});

test("validateInstagramOAuthTextRecipient accepts numeric IGSID", () => {
  const igsid = validateInstagramOAuthTextRecipient({
    recipientMessagingScopedUserId: "959986016929726"
  });
  assert.equal(igsid, "959986016929726");
});
