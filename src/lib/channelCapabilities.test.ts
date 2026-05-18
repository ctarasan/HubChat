import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelCapabilityContext,
  FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY,
  FACEBOOK_COMMENT_IMAGE_UNSUPPORTED,
  getOutboundCapabilityFlags,
  getOutboundSendUnsupportedReason,
  isOutboundSendKindSupported,
  OUTBOUND_CHANNEL_UNSUPPORTED,
  OUTBOUND_THREAD_TYPE_UNSUPPORTED
} from "./channelCapabilities.js";
import { INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED } from "../domain/instagramDmMessages.js";

test("LINE allows text, image, and PDF", () => {
  const ctx = buildChannelCapabilityContext({ channel: "LINE" });
  assert.equal(isOutboundSendKindSupported(ctx, "text"), true);
  assert.equal(isOutboundSendKindSupported(ctx, "image"), true);
  assert.equal(isOutboundSendKindSupported(ctx, "document_pdf"), true);
});

test("Facebook Messenger DM allows text, image, and PDF", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "FACEBOOK",
    providerThreadType: "MESSENGER_DM"
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "text"), null);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), null);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "document_pdf"), null);
});

test("Facebook comment-origin first private reply is text-only", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    privateReplySentAt: null
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "text"), null);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), FACEBOOK_COMMENT_IMAGE_UNSUPPORTED);
  assert.equal(
    getOutboundSendUnsupportedReason(ctx, "document_pdf"),
    FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY
  );
  assert.equal(
    getOutboundSendUnsupportedReason(ctx, "image", { facebookPrivateReplyRoute: true }),
    FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY
  );
  const flags = getOutboundCapabilityFlags(ctx);
  assert.equal(flags.text, true);
  assert.equal(flags.image, false);
  assert.equal(flags.documentPdf, false);
  assert.equal(flags.firstPrivateReply, true);
});

test("Facebook comment after private reply sent allows media", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    privateReplySentAt: new Date()
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), null);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "document_pdf"), null);
});

test("Facebook COMMENT target type blocks image at API layer context", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "FACEBOOK",
    facebookTargetType: "COMMENT"
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), FACEBOOK_COMMENT_IMAGE_UNSUPPORTED);
});

test("Instagram DM allows text and image", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_DM"
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "text"), null);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), null);
});

test("Instagram DM rejects PDF", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_DM"
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "document_pdf"), INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED);
});

test("unknown channel fails safe", () => {
  const ctx = buildChannelCapabilityContext({ channel: "TIKTOK" });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "text"), OUTBOUND_CHANNEL_UNSUPPORTED);
  assert.equal(getOutboundSendUnsupportedReason(ctx, "image"), OUTBOUND_CHANNEL_UNSUPPORTED);
});

test("unknown provider thread type fails safe for Instagram", () => {
  const ctx = buildChannelCapabilityContext({
    channel: "INSTAGRAM",
    providerThreadType: "MESSENGER_DM"
  });
  assert.equal(getOutboundSendUnsupportedReason(ctx, "text"), OUTBOUND_THREAD_TYPE_UNSUPPORTED);
});
