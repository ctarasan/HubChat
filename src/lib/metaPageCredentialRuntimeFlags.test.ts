import test from "node:test";
import assert from "node:assert/strict";
import { isMetaPageCredentialEnabled } from "./metaPageCredentialRuntimeFlags.js";

test("isMetaPageCredentialEnabled defaults OFF when absent", () => {
  assert.equal(isMetaPageCredentialEnabled({}), false);
});

test("isMetaPageCredentialEnabled treats explicit false as OFF", () => {
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "false" }), false);
});

test("isMetaPageCredentialEnabled enables only exact true", () => {
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "true" }), true);
});

test("isMetaPageCredentialEnabled rejects permissive truthy values", () => {
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "1" }), false);
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "yes" }), false);
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "on" }), false);
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: "TRUE" }), false);
  assert.equal(isMetaPageCredentialEnabled({ HUBCHAT_META_PAGE_CREDENTIAL_ENABLED: " maybe" }), false);
});
