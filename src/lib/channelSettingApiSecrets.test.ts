import test from "node:test";
import assert from "node:assert/strict";
import {
  filterNonBlankSecretsPatch,
  normalizeApiClearSecrets,
  normalizeApiSecretsPatch,
  normalizeClearSecretKeys,
  normalizeIncomingSecretsPatch
} from "./channelSettingApiSecrets.js";

test("filterNonBlankSecretsPatch drops blank values", () => {
  assert.equal(filterNonBlankSecretsPatch({ accessToken: "  ", channelSecret: "x" })?.channelSecret, "x");
  assert.equal(filterNonBlankSecretsPatch({ accessToken: "" }), undefined);
});

test("normalizeApiSecretsPatch maps API names to storage keys", () => {
  const patch = normalizeApiSecretsPatch("LINE", {
    accessToken: "line-token",
    channelSecret: "line-secret"
  });
  assert.deepEqual(patch, {
    channel_access_token: "line-token",
    channel_secret: "line-secret"
  });
});

test("normalizeApiClearSecrets maps clearSecrets to storage keys", () => {
  const keys = normalizeApiClearSecrets("FACEBOOK", ["accessToken", "appSecret"]);
  assert.deepEqual(keys, ["page_access_token", "app_secret"]);
});

test("normalizeApiSecretsPatch rejects unknown API secret keys", () => {
  assert.throws(() => normalizeApiSecretsPatch("LINE", { unknown: "x" }));
});

test("normalizeIncomingSecretsPatch accepts legacy storage keys", () => {
  const patch = normalizeIncomingSecretsPatch("LINE", { channel_secret: "legacy-secret" });
  assert.deepEqual(patch, { channel_secret: "legacy-secret" });
});

test("normalizeClearSecretKeys merges clearSecrets and clearSecretKeys", () => {
  const keys = normalizeClearSecretKeys("LINE", ["accessToken"], ["channel_secret"]);
  assert.deepEqual(keys?.sort(), ["channel_access_token", "channel_secret"].sort());
});
