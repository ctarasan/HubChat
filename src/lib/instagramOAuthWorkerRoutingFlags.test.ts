import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramOAuthWorkerRoutingEnabled } from "./instagramOAuthWorkerRoutingFlags.js";

test("worker routing flag defaults OFF", () => {
  assert.equal(isInstagramOAuthWorkerRoutingEnabled({}), false);
  assert.equal(isInstagramOAuthWorkerRoutingEnabled({ HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "" }), false);
  assert.equal(isInstagramOAuthWorkerRoutingEnabled({ HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "false" }), false);
});

test("worker routing flag ON only with explicit true", () => {
  assert.equal(
    isInstagramOAuthWorkerRoutingEnabled({ HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "true" }),
    true
  );
});
