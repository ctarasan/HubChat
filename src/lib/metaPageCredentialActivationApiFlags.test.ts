import test from "node:test";
import assert from "node:assert/strict";
import { isMetaPageCredentialActivationApiEnabled } from "./metaPageCredentialActivationApiFlags.js";

test("activation API flag is OFF when env is absent", () => {
  assert.equal(isMetaPageCredentialActivationApiEnabled({}), false);
});

test("activation API flag is OFF for invalid values", () => {
  assert.equal(
    isMetaPageCredentialActivationApiEnabled({
      HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED: "false"
    }),
    false
  );
  assert.equal(
    isMetaPageCredentialActivationApiEnabled({
      HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED: "maybe"
    }),
    false
  );
});

test("activation API flag is ON only for canonical true values", () => {
  assert.equal(
    isMetaPageCredentialActivationApiEnabled({
      HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED: "true"
    }),
    true
  );
  assert.equal(
    isMetaPageCredentialActivationApiEnabled({
      HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED: "1"
    }),
    true
  );
});
