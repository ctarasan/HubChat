import test from "node:test";
import assert from "node:assert/strict";
import {
  getFirstLineWebhookEvent,
  isLineCustomerMessageWebhookEvent,
  isLineNonMessageWebhookEvent
} from "./lineInboundWebhookGate.js";

test("isLineCustomerMessageWebhookEvent accepts text and image messages", () => {
  assert.equal(
    isLineCustomerMessageWebhookEvent({
      type: "message",
      message: { type: "text" }
    }),
    true
  );
  assert.equal(
    isLineCustomerMessageWebhookEvent({
      type: "message",
      message: { type: "image" }
    }),
    true
  );
});

test("isLineCustomerMessageWebhookEvent accepts sticker file audio video location", () => {
  for (const messageType of ["sticker", "file", "audio", "video", "location"]) {
    assert.equal(
      isLineCustomerMessageWebhookEvent({
        type: "message",
        message: { type: messageType }
      }),
      true,
      messageType
    );
  }
});

test("isLineNonMessageWebhookEvent rejects follow unfollow postback and unknown message types", () => {
  assert.equal(isLineNonMessageWebhookEvent({ type: "follow" }), true);
  assert.equal(isLineNonMessageWebhookEvent({ type: "unfollow" }), true);
  assert.equal(isLineNonMessageWebhookEvent({ type: "postback" }), true);
  assert.equal(
    isLineNonMessageWebhookEvent({
      type: "message",
      message: { type: "unsend" }
    }),
    true
  );
});

test("getFirstLineWebhookEvent returns first event only", () => {
  const event = getFirstLineWebhookEvent({
    events: [{ type: "follow" }, { type: "message", message: { type: "text" } }]
  });
  assert.equal(event?.type, "follow");
});
