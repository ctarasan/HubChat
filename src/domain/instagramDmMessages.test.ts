import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT,
  instagramDmOutboundCaptionToSend
} from "./instagramDmMessages.js";

test("instagramDmOutboundCaptionToSend skips empty and UI placeholder", () => {
  assert.equal(instagramDmOutboundCaptionToSend(""), null);
  assert.equal(instagramDmOutboundCaptionToSend("   "), null);
  assert.equal(instagramDmOutboundCaptionToSend(INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT), null);
  assert.equal(instagramDmOutboundCaptionToSend(`  ${INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT}  `), null);
});

test("instagramDmOutboundCaptionToSend returns trimmed user caption", () => {
  assert.equal(instagramDmOutboundCaptionToSend("  hello  "), "hello");
});
