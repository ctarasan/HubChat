import test from "node:test";
import assert from "node:assert/strict";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { InstagramCredentialBinding } from "../domain/instagramOAuthOutboundContract.js";
import {
  assertOAuthInstagramWorkerRoutingEnabled,
  classifyInstagramOutboundJob,
  oauthBindingMatchesPayloadMessageType
} from "./instagramOAuthOutboundWorkerRouting.js";

const CONNECTION = "cc111111-1111-4111-8111-111111111111";

const oauthTextPayload: OutboundMessageRequestedPayload = {
  tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
  leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
  messageId: "msg-oauth-1",
  conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
  channel: "INSTAGRAM",
  channelThreadId: "ig:user:959986016929726",
  content: "hello",
  messageType: "TEXT",
  instagramCredentialBinding: {
    mode: "CONNECTION_BOUND",
    contractVersion: 1,
    provider: "INSTAGRAM",
    authFamily: "INSTAGRAM_BUSINESS_LOGIN",
    deliveryPath: "DATABASE_ONLY",
    channelConnectionId: CONNECTION,
    messageKind: "TEXT"
  }
};

test("classifyInstagramOutboundJob detects OAuth, legacy, and invalid jobs", () => {
  assert.equal(classifyInstagramOutboundJob(oauthTextPayload), "OAUTH_INSTAGRAM_JOB");
  assert.equal(
    classifyInstagramOutboundJob({ ...oauthTextPayload, instagramCredentialBinding: undefined }),
    "LEGACY_INSTAGRAM_JOB"
  );
  assert.equal(
    classifyInstagramOutboundJob({
      ...oauthTextPayload,
      instagramCredentialBinding: {
        mode: "CONNECTION_BOUND",
        contractVersion: 1,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        deliveryPath: "DATABASE_ONLY",
        channelConnectionId: CONNECTION,
        messageKind: "TEXT",
        accessToken: "must-not-parse"
      } as never
    }),
    "INVALID_OR_AMBIGUOUS_JOB"
  );
  assert.equal(classifyInstagramOutboundJob({ ...oauthTextPayload, channel: "LINE" }), "NON_INSTAGRAM_JOB");
});

const oauthBinding = oauthTextPayload.instagramCredentialBinding as Extract<
  InstagramCredentialBinding,
  { mode: "CONNECTION_BOUND" }
>;

test("worker routing flag OFF blocks OAuth routing", () => {
  const block = assertOAuthInstagramWorkerRoutingEnabled(oauthBinding, {
    HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
  });
  assert.equal(block?.internalCode, "OAUTH_WORKER_ROUTING_DISABLED");
});

test("text flag OFF blocks OAuth text routing even when worker routing ON", () => {
  const block = assertOAuthInstagramWorkerRoutingEnabled(oauthBinding, {
    HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true"
  });
  assert.equal(block?.internalCode, "OAUTH_OUTBOUND_TEXT_DISABLED");
});

test("image flag OFF blocks OAuth image routing", () => {
  const binding = { ...oauthBinding, messageKind: "IMAGE" as const };
  const block = assertOAuthInstagramWorkerRoutingEnabled(binding, {
    HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "false"
  });
  assert.equal(block?.internalCode, "OAUTH_OUTBOUND_IMAGE_DISABLED");
});

test("all required OAuth text flags ON allow routing", () => {
  const block = assertOAuthInstagramWorkerRoutingEnabled(oauthBinding, {
    HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
    HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
  });
  assert.equal(block, null);
});

test("oauthBindingMatchesPayloadMessageType validates message kind alignment", () => {
  assert.equal(oauthBindingMatchesPayloadMessageType(oauthBinding, oauthTextPayload), true);
  assert.equal(
    oauthBindingMatchesPayloadMessageType(oauthBinding, {
      ...oauthTextPayload,
      messageType: "IMAGE"
    }),
    false
  );
});
