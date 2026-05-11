import test from "node:test";
import assert from "node:assert/strict";
import { InstagramGraphApiError } from "../infrastructure/adapters/channels/instagramGraphApiError.js";
import {
  classifyOutboundProviderFailure,
  INTERNAL_CODE_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW,
  INTERNAL_CODE_OUTBOUND_PROVIDER_ERROR,
  isInstagramOutsideAllowedWindowError,
  TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW,
  TH_MSG_OUTBOUND_PROVIDER_GENERIC
} from "./outboundDeliveryError.js";

test("isInstagramOutsideAllowedWindowError: Meta code 10 + subcode 2534022", () => {
  const err = new InstagramGraphApiError(
    400,
    "/v25.0/page/messages",
    {
      message: "(#10) This message is sent outside of allowed window.",
      type: "OAuthException",
      code: 10,
      error_subcode: 2534022,
      fbtrace_id: "x"
    },
    "{}"
  );
  assert.equal(isInstagramOutsideAllowedWindowError(err), true);
  const c = classifyOutboundProviderFailure("INSTAGRAM", err);
  assert.equal(c.internalCode, INTERNAL_CODE_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW);
  assert.equal(c.retryable, false);
  assert.equal(c.userFacingMessage, TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW);
});

test("isInstagramOutsideAllowedWindowError: outside of allowed window phrasing (code 10, unknown subcode)", () => {
  const err = new Error(
    'Instagram Send API failed (400): {"error":{"message":"(#10) This message is sent outside of allowed window.","type":"OAuthException","code":10}}'
  );
  assert.equal(isInstagramOutsideAllowedWindowError(err), true);
});

test("Instagram unrelated Graph error is retryable generic", () => {
  const err = new InstagramGraphApiError(
    400,
    "/v25.0/p/messages",
    { message: "boom", code: 100, error_subcode: 33, type: "OAuthException", fbtrace_id: "f" },
    "{}"
  );
  assert.equal(isInstagramOutsideAllowedWindowError(err), false);
  const c = classifyOutboundProviderFailure("INSTAGRAM", err);
  assert.equal(c.internalCode, INTERNAL_CODE_OUTBOUND_PROVIDER_ERROR);
  assert.equal(c.retryable, true);
  assert.equal(c.userFacingMessage, TH_MSG_OUTBOUND_PROVIDER_GENERIC);
});
