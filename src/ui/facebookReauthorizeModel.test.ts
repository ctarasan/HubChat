import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FACEBOOK_REAUTHORIZE_CONFIRM_COPY,
  FACEBOOK_REAUTHORIZE_CTA_LABEL,
  canDismissFacebookReauthorizeConfirm,
  formatFacebookReauthorizeLinkedPageLine,
  shouldShowFacebookConnectedReauthorize
} from "./facebookReauthorizeModel.js";

const cardSource = readFileSync(new URL("./FacebookConnectCard.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(
  new URL("./FacebookReauthorizeConfirmDialog.tsx", import.meta.url),
  "utf8"
);

test("CONNECTED READY shows reauthorize CTA helper", () => {
  assert.equal(
    shouldShowFacebookConnectedReauthorize({
      oauthAvailable: true,
      presentationState: "CONNECTED",
      connectionStatus: "READY",
      providerPageId: "541846535686129"
    }),
    true
  );
});

test("NOT_CONNECTED does not show connected reauthorize CTA", () => {
  assert.equal(
    shouldShowFacebookConnectedReauthorize({
      oauthAvailable: true,
      presentationState: "NOT_CONNECTED",
      connectionStatus: null,
      providerPageId: null
    }),
    false
  );
});

test("NEEDS_RECONNECT does not use connected reauthorize CTA", () => {
  assert.equal(
    shouldShowFacebookConnectedReauthorize({
      oauthAvailable: true,
      presentationState: "NEEDS_RECONNECT",
      connectionStatus: "RECONNECT_REQUIRED",
      providerPageId: "541846535686129"
    }),
    false
  );
});

test("capability UNKNOWN alone does not drive CTA helper", () => {
  // Helper ignores health/capability — CONNECTED+READY+page only.
  assert.equal(
    shouldShowFacebookConnectedReauthorize({
      oauthAvailable: true,
      presentationState: "CONNECTED",
      connectionStatus: "READY",
      providerPageId: "541846535686129"
    }),
    true
  );
  assert.equal(
    shouldShowFacebookConnectedReauthorize({
      oauthAvailable: true,
      presentationState: "ERROR",
      connectionStatus: "READY",
      providerPageId: "541846535686129"
    }),
    false
  );
});

test("linked page formatting includes Page ID", () => {
  assert.equal(
    formatFacebookReauthorizeLinkedPageLine({
      providerPageName: "SMARTKORP",
      providerPageId: "541846535686129"
    }),
    "SMARTKORP (541846535686129)"
  );
});

test("confirm dialog copy covers required warnings", () => {
  assert.match(FACEBOOK_REAUTHORIZE_CONFIRM_COPY.intro, /App Review/i);
  assert.match(FACEBOOK_REAUTHORIZE_CONFIRM_COPY.mustSelectSamePage, /same linked Page/i);
  assert.match(FACEBOOK_REAUTHORIZE_CONFIRM_COPY.credentialUntilSuccess, /credentials stay/i);
  assert.equal(FACEBOOK_REAUTHORIZE_CONFIRM_COPY.confirm, "Continue to Meta");
  assert.equal(FACEBOOK_REAUTHORIZE_CONFIRM_COPY.cancel, "Cancel");
  assert.equal(FACEBOOK_REAUTHORIZE_CTA_LABEL, "Re-authorize Facebook");
});

test("pending phase is not dismissible", () => {
  assert.equal(canDismissFacebookReauthorizeConfirm("pending"), false);
  assert.equal(canDismissFacebookReauthorizeConfirm("idle"), true);
});

test("card opens confirm before starting reauthorize API", () => {
  assert.match(cardSource, /facebook-reauthorize-start/);
  assert.match(cardSource, /openReauthorizeConfirm/);
  assert.match(cardSource, /FACEBOOK_CONNECT_API\.reauthorize/);
  assert.match(cardSource, /FacebookReauthorizeConfirmDialog/);
  assert.equal(cardSource.includes("onClick={() => void startOAuth(false)}") && cardSource.includes("facebook-connect-start"), true);
  // CTA must not call reauthorize API directly
  assert.doesNotMatch(
    cardSource,
    /data-testid="facebook-reauthorize-start"[\s\S]{0,200}FACEBOOK_CONNECT_API\.reauthorize/
  );
});

test("confirm dialog has ARIA dialog semantics and focus trap", () => {
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /Escape/);
  assert.match(dialogSource, /getFocusable/);
  assert.match(dialogSource, /facebook-reauthorize-confirm-cancel/);
  assert.match(dialogSource, /facebook-reauthorize-confirm-submit/);
});

test("cancel path does not POST reauthorize (source guard)", () => {
  assert.match(cardSource, /function cancelReauthorizeConfirm/);
  const cancelFn = cardSource.slice(
    cardSource.indexOf("function cancelReauthorizeConfirm"),
    cardSource.indexOf("async function confirmReauthorize")
  );
  assert.equal(cancelFn.includes("FACEBOOK_CONNECT_API.reauthorize"), false);
  assert.equal(cancelFn.includes("facebookConnectFetch"), false);
});
