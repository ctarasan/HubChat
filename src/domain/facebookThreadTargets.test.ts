import test from "node:test";
import assert from "node:assert/strict";
import { resolveFacebookMessengerRecipientPsid } from "./facebookThreadTargets.js";

test("resolveFacebookMessengerRecipientPsid prefers provider_external_user_id", () => {
  assert.equal(
    resolveFacebookMessengerRecipientPsid("user:wrong-prefix", "12345678901234567"),
    "12345678901234567"
  );
});

test("resolveFacebookMessengerRecipientPsid strips user: from channel_thread_id", () => {
  assert.equal(resolveFacebookMessengerRecipientPsid("user:12345678901234567", null), "12345678901234567");
});

test("resolveFacebookMessengerRecipientPsid accepts raw numeric PSID", () => {
  assert.equal(resolveFacebookMessengerRecipientPsid("12345678901234567", null), "12345678901234567");
});

test("resolveFacebookMessengerRecipientPsid rejects comment thread targets", () => {
  assert.equal(resolveFacebookMessengerRecipientPsid("comment:123_456", "12345678901234567"), "12345678901234567");
  assert.equal(resolveFacebookMessengerRecipientPsid("122098025780693891_1278672180548121", null), null);
});
