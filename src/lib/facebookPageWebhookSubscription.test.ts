import test from "node:test";
import assert from "node:assert/strict";
import {
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_SUBSCRIBED_FIELDS
} from "../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  buildUnionPreservingSubscribedFields,
  evaluateFacebookPageWebhookSubscription,
  facebookWebhookSubscriptionOperatorMessage
} from "./facebookPageWebhookSubscription.js";

const APP_ID = "943662608544465";
const FULL_REQUIRED = [...FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS];
const MESSENGER_ONLY = [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS];

test("buildUnion: messages+feed expands to full Messenger set + feed", () => {
  const fields = buildUnionPreservingSubscribedFields({
    existingFields: ["messages", "feed"]
  });
  assert.deepEqual(fields, [
    "messages",
    "feed",
    "messaging_postbacks",
    "message_deliveries",
    "message_reads",
    "message_echoes"
  ]);
});

test("buildUnion: full Messenger without feed adds feed", () => {
  assert.deepEqual(
    buildUnionPreservingSubscribedFields({ existingFields: MESSENGER_ONLY }),
    [...MESSENGER_ONLY, "feed"]
  );
});

test("buildUnion: feed only expands to Messenger + feed", () => {
  assert.deepEqual(
    buildUnionPreservingSubscribedFields({ existingFields: ["feed"] }),
    ["feed", ...MESSENGER_ONLY]
  );
});

test("buildUnion: preserves unknown extras", () => {
  assert.deepEqual(
    buildUnionPreservingSubscribedFields({
      existingFields: [...MESSENGER_ONLY, "conversations", "feed"]
    }),
    [...MESSENGER_ONLY, "conversations", "feed"]
  );
});

test("buildUnion: deduplicates and drops empty/whitespace", () => {
  assert.deepEqual(
    buildUnionPreservingSubscribedFields({
      existingFields: ["messages", " messages ", "", "  ", "messages", "feed"]
    }),
    ["messages", "feed", "messaging_postbacks", "message_deliveries", "message_reads", "message_echoes"]
  );
});

test("buildUnion: SmartKorp production-shaped messages+feed", () => {
  const fields = buildUnionPreservingSubscribedFields({
    existingFields: ["messages", "feed"]
  });
  for (const required of FULL_REQUIRED) {
    assert.equal(fields.includes(required), true, `missing ${required}`);
  }
});

test("buildUnion: Connex Messenger set gains feed without losing fields", () => {
  const fields = buildUnionPreservingSubscribedFields({
    existingFields: MESSENGER_ONLY
  });
  assert.deepEqual(fields, [...MESSENGER_ONLY, "feed"]);
});

test("evaluate: Connex-style + feed passes regardless of field order", () => {
  const shuffled = [
    "feed",
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
});

test("evaluate: extras still pass when required Messenger+feed exist", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [
      {
        id: APP_ID,
        subscribedFields: [...FULL_REQUIRED, "conversations"]
      }
    ]
  });
  assert.equal(result.ok, true);
});

test("evaluate: messages + feed only fails for missing Messenger fields", () => {
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

test("evaluate: full Messenger without feed fails", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: APP_ID, subscribedFields: MESSENGER_ONLY }]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.missingFields, ["feed"]);
  }
});

test("evaluate: missing HubChat app fails verification", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: "other-app", subscribedFields: FULL_REQUIRED }]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "app_missing");
    assert.match(facebookWebhookSubscriptionOperatorMessage(result), /not subscribed/i);
  }
});

test("evaluate: comments is not a substitute for feed", () => {
  const result = evaluateFacebookPageWebhookSubscription({
    expectedAppId: APP_ID,
    apps: [{ id: APP_ID, subscribedFields: [...MESSENGER_ONLY, "comments"] }]
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.missingFields, ["feed"]);
  }
});
