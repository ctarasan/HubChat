import test from "node:test";
import assert from "node:assert/strict";
import { parseFacebookMessengerWebhookEvents } from "./facebookMessengerWebhookEvents.js";

const PAGE_ID = "1137356672785125";
const CUSTOMER_PSID = "customer_psid_99";

test("parseFacebookMessengerWebhookEvents maps native Page text echo", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1_700_000_000_000,
            message: { mid: "mid.echo.1", text: "Reply from Business Suite", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "message_echo");
  if (events[0]?.kind !== "message_echo") return;
  assert.equal(events[0].externalMessageId, "mid.echo.1");
  assert.equal(events[0].customerPsid, CUSTOMER_PSID);
  assert.equal(events[0].channelThreadId, CUSTOMER_PSID);
  assert.equal(events[0].text, "Reply from Business Suite");
  assert.equal(events[0].idempotencyKey, "facebook:echo:mid.echo.1");
});

test("parseFacebookMessengerWebhookEvents resolves customer PSID on echo not Page sender", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1,
            message: { mid: "mid.echo.2", text: "hi", is_echo: true }
          }
        ]
      }
    ]
  });
  const echo = events.find((event) => event.kind === "message_echo");
  assert.ok(echo && echo.kind === "message_echo");
  assert.equal(echo.customerPsid, CUSTOMER_PSID);
  assert.notEqual(echo.customerPsid, PAGE_ID);
});

test("parseFacebookMessengerWebhookEvents does not emit inbound for echo-only Page sender", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1,
            message: { mid: "mid.echo.3", text: "native", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.equal(events.some((event) => event.kind === "inbound_messenger"), false);
});

test("parseFacebookMessengerWebhookEvents mixed inbound and echo in one payload", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: CUSTOMER_PSID },
            recipient: { id: PAGE_ID },
            timestamp: 1,
            message: { mid: "mid.in.1", text: "customer asks" }
          },
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 2,
            message: { mid: "mid.echo.4", text: "page replies", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.equal(events.length, 2);
  assert.equal(events[0]?.kind, "inbound_messenger");
  assert.equal(events[1]?.kind, "message_echo");
});

test("parseFacebookMessengerWebhookEvents messenger echo is not blocked by page self-comment guard", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1,
            message: { mid: "mid.echo.5", text: "suite reply", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "message_echo");
});

test("parseFacebookMessengerWebhookEvents skips delivery read and reaction messenger events", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          { sender: { id: CUSTOMER_PSID }, recipient: { id: PAGE_ID }, timestamp: 1, delivery: { mids: ["m1"] } },
          { sender: { id: CUSTOMER_PSID }, recipient: { id: PAGE_ID }, timestamp: 2, read: { watermark: 1 } },
          {
            sender: { id: CUSTOMER_PSID },
            recipient: { id: PAGE_ID },
            timestamp: 3,
            reaction: { action: "react", emoji: "love" }
          }
        ]
      }
    ]
  });
  assert.deepEqual(events, []);
});

test("parseFacebookMessengerWebhookEvents skips echo without mid", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1,
            message: { text: "no mid", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.deepEqual(events, []);
});

test("parseFacebookMessengerWebhookEvents skips echo without recipient PSID", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            timestamp: 1,
            message: { mid: "mid.echo.6", text: "orphan", is_echo: true }
          }
        ]
      }
    ]
  });
  assert.deepEqual(events, []);
});

test("parseFacebookMessengerWebhookEvents customer inbound unchanged", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: CUSTOMER_PSID },
            recipient: { id: PAGE_ID },
            timestamp: 1,
            message: { mid: "mid.in.2", text: "hello" }
          }
        ]
      }
    ]
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "inbound_messenger");
  if (events[0]?.kind !== "inbound_messenger") return;
  assert.equal(events[0].externalUserId, CUSTOMER_PSID);
  assert.equal(events[0].idempotencyKey, "facebook:mid.in.2");
});

test("parseFacebookMessengerWebhookEvents maps image echo when attachment url is https", () => {
  const events = parseFacebookMessengerWebhookEvents({
    pageId: PAGE_ID,
    entry: [
      {
        id: PAGE_ID,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: CUSTOMER_PSID },
            timestamp: 1,
            message: {
              mid: "mid.echo.img",
              is_echo: true,
              attachments: [{ type: "image", payload: { url: "https://cdn.example/photo.jpg" } }]
            }
          }
        ]
      }
    ]
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "message_echo");
  if (events[0]?.kind !== "message_echo") return;
  assert.equal(events[0].messageType, "IMAGE");
  assert.equal(events[0].mediaUrl, "https://cdn.example/photo.jpg");
});
