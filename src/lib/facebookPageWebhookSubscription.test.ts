import test from "node:test";
import assert from "node:assert/strict";
import { FACEBOOK_PAGE_SUBSCRIBED_FIELDS } from "../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  evaluateFacebookPageWebhookSubscription,
  facebookWebhookSubscriptionOperatorMessage
} from "./facebookPageWebhookSubscription.js";

const APP_ID = "943662608544465";
const FULL_FIELDS = [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS];

test("Connex-style full subscription passes regardless of field order", () => {
  const shuffled = [
    "message_echoes",
    "messages",
    "message_reads",
    "messaging_postbacks",
    "message_deliveries"
  ];
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: APP_ID, subscribedFields: shuffled }]
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matchedAppId, APP_ID);
  }
});

test("extra Meta fields still pass when required fields exist", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [
      {
        id: APP_ID,
        subscribedFields: [...FULL_FIELDS, "feed", "conversations"]
      }
    ]
  });
  assert.equal(result.ok, true);
});

test("messages + feed only fails verification", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: APP_ID, subscribedFields: ["messages", "feed"] }]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "fields_incomplete");
    assert.deepEqual(result.missingFields.sort(), [
      "message_deliveries",
      "message_echoes",
      "message_reads",
      "messaging_postbacks"
    ]);
    assert.match(facebookWebhookSubscriptionOperatorMessage(result), /incomplete/i);
  }
});

test("missing HubChat app fails verification", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: "other-app", subscribedFields: FULL_FIELDS }]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "app_missing");
    assert.match(facebookWebhookSubscriptionOperatorMessage(result), /not subscribed/i);
  }
});

test("missing a single required field fails", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [
      {
        id: APP_ID,
        subscribedFields: FULL_FIELDS.filter((f) => f !== "message_echoes")
      }
    ]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.missingFields, ["message_echoes"]);
  }
});
