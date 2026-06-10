import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_LIST_DTO_KEYS,
  MESSAGE_LIST_DTO_KEYS,
  MESSAGE_METADATA_BLOCKED_KEYS,
  slimMessageMetadata,
  toConversationListItemDto,
  toMessageListItemDto
} from "./inboxDtos.js";
import type { Message } from "../../domain/entities.js";

test("toConversationListItemDto maps Instagram profile image when provider id matches identity", () => {
  const dto = toConversationListItemDto({
    id: "c-ig",
    tenant_id: "t1",
    lead_id: "l1",
    contact_id: "ct1",
    channel_type: "INSTAGRAM",
    channel_thread_id: "thread-ig",
    participant_display_name: null,
    participant_profile_image_url: null,
    status: "OPEN",
    last_message_at: "2026-05-01T10:00:00.000Z",
    unread_count: 0,
    provider_external_user_id: "17409356",
    leads: { status: "NEW", external_user_id: "111" },
    contacts: {
      profile_image_url: null,
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "17409356",
          profile_image_url: "https://cdn.example/ig-profile.jpg"
        }
      ]
    }
  });
  assert.equal(dto.contact_identity_profile_image_url, "https://cdn.example/ig-profile.jpg");
});

test("toConversationListItemDto maps Instagram profile image from ig:user channel_thread_id", () => {
  const dto = toConversationListItemDto({
    id: "c-ig-thread",
    tenant_id: "t1",
    lead_id: "l1",
    contact_id: "ct1",
    channel_type: "INSTAGRAM",
    channel_thread_id: "ig:user:959986016929726",
    participant_display_name: "IG User",
    participant_profile_image_url: null,
    status: "OPEN",
    last_message_at: "2026-05-01T10:00:00.000Z",
    unread_count: 0,
    provider_external_user_id: null,
    leads: { status: "NEW", external_user_id: "wrong" },
    contacts: {
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "959986016929726",
          profile_image_url: "https://cdn.example/ig-thread.jpg"
        }
      ]
    }
  });
  assert.equal(dto.participant_profile_image_url, "https://cdn.example/ig-thread.jpg");
  assert.equal(dto.contact_identity_profile_image_url, "https://cdn.example/ig-thread.jpg");
});

test("toConversationListItemDto preserves LINE avatar via lead external_user_id match", () => {
  const dto = toConversationListItemDto({
    id: "c-line",
    tenant_id: "t1",
    lead_id: "l1",
    contact_id: "ct1",
    channel_type: "LINE",
    channel_thread_id: "thread-line",
    participant_display_name: "Ada",
    participant_profile_image_url: "https://cdn.example/line-snap.jpg",
    status: "OPEN",
    last_message_at: "2026-05-01T10:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "U-line-1" },
    contacts: {
      contact_identities: [
        {
          channel_type: "LINE",
          external_user_id: "U-line-1",
          profile_image_url: "https://cdn.example/line-id.jpg"
        }
      ]
    }
  });
  assert.equal(dto.participant_profile_image_url, "https://cdn.example/line-snap.jpg");
  assert.equal(dto.contact_identity_profile_image_url, "https://cdn.example/line-snap.jpg");
});

test("toConversationListItemDto ignores non-HTTPS profile image URLs", () => {
  const dto = toConversationListItemDto({
    id: "c-http",
    tenant_id: "t1",
    lead_id: "l1",
    contact_id: "ct1",
    channel_type: "INSTAGRAM",
    channel_thread_id: "ig:user:1",
    status: "OPEN",
    last_message_at: "2026-05-01T10:00:00.000Z",
    unread_count: 0,
    participant_profile_image_url: "http://insecure.example/x.jpg",
    leads: { status: "NEW", external_user_id: "1" },
    contacts: {
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "1",
          profile_image_url: "http://insecure.example/y.jpg"
        }
      ]
    }
  });
  assert.equal(dto.participant_profile_image_url, null);
  assert.equal(dto.contact_identity_profile_image_url, null);
});

test("toConversationListItemDto returns only lean list fields", () => {
  const dto = toConversationListItemDto({
    id: "c1",
    tenant_id: "t1",
    lead_id: "l1",
    contact_id: "ct1",
    channel_type: "LINE",
    channel_thread_id: "thread-1",
    participant_display_name: "Ada",
    status: "OPEN",
    last_message_at: "2026-05-01T10:00:00.000Z",
    unread_count: 2,
    leads: { status: "NEW", external_user_id: "u1" },
    contacts: {
      contact_identities: [{ channel_type: "LINE", external_user_id: "u1", display_name: "Ada ID" }]
    }
  });
  const keys = Object.keys(dto).sort();
  assert.deepEqual(keys, [...CONVERSATION_LIST_DTO_KEYS].sort());
  assert.equal(dto.lead_status, "NEW");
  assert.equal(dto.external_user_id, "u1");
  assert.equal(dto.contact_identity_display_name, "Ada ID");
});

test("toMessageListItemDto strips bulky metadata", () => {
  const message: Message = {
    id: "m1",
    tenantId: "t1",
    conversationId: "c1",
    channelType: "LINE",
    externalMessageId: "ext",
    messageType: "IMAGE",
    direction: "OUTBOUND",
    senderType: "SALES",
    content: "hi",
    mediaUrl: "https://cdn.example/full.jpg",
    previewUrl: "https://cdn.example/thumb.jpg",
    metadataJson: {
      delivery_status: "FAILED",
      delivery_error_message: "ส่งไม่ผ่าน",
      previewUrl: "https://cdn.example/thumb.jpg",
      rawWebhook: { huge: true },
      storageBucket: "inbound-media",
      originalPath: "t1/x.jpg"
    },
    occurredAt: new Date("2026-05-01T10:00:00.000Z"),
    createdAt: new Date("2026-05-01T10:00:00.000Z")
  };
  const dto = toMessageListItemDto(message);
  assert.deepEqual(Object.keys(dto).sort(), [...MESSAGE_LIST_DTO_KEYS].sort());
  assert.equal(dto.metadata_json.delivery_status, "FAILED");
  assert.equal("rawWebhook" in dto.metadata_json, false);
  assert.equal("storageBucket" in dto.metadata_json, false);
  assert.equal(dto.preview_url, "https://cdn.example/thumb.jpg");
  assert.equal(dto.media_url, "https://cdn.example/full.jpg");
});

test("toMessageListItemDto omits duplicate preview when same as download URL", () => {
  const message: Message = {
    id: "m2",
    tenantId: "t1",
    conversationId: "c1",
    channelType: "LINE",
    externalMessageId: "ext2",
    messageType: "IMAGE",
    direction: "OUTBOUND",
    senderType: "SALES",
    content: "",
    mediaUrl: "https://cdn.example/same.jpg",
    previewUrl: "https://cdn.example/same.jpg",
    occurredAt: new Date("2026-05-01T10:00:00.000Z"),
    createdAt: new Date("2026-05-01T10:00:00.000Z")
  };
  const dto = toMessageListItemDto(message);
  assert.equal(dto.media_url, "https://cdn.example/same.jpg");
  assert.equal(dto.preview_url, null);
});

test("MESSAGE_METADATA_BLOCKED_KEYS stay out of slim metadata", () => {
  const slim = slimMessageMetadata(
    Object.fromEntries(MESSAGE_METADATA_BLOCKED_KEYS.map((k) => [k, "blocked"]))
  );
  for (const key of MESSAGE_METADATA_BLOCKED_KEYS) {
    assert.equal(key in slim, false);
  }
});

test("slimMessageMetadata keeps delivery and preview keys only", () => {
  const slim = slimMessageMetadata({
    delivery_status: "SENT",
    previewUrl: "https://x/y.jpg",
    lineMessageId: "should-drop"
  });
  assert.equal(slim.delivery_status, "SENT");
  assert.equal(slim.previewUrl, "https://x/y.jpg");
  assert.equal("lineMessageId" in slim, false);
});

test("toConversationListItemDto exposes Facebook comment source classification", () => {
  const dto = toConversationListItemDto({
    id: "c-fb-comment",
    tenant_id: "t1",
    lead_id: "l1",
    channel_type: "FACEBOOK",
    channel_thread_id: "comment:123_456",
    provider_thread_type: "FACEBOOK_COMMENT",
    provider_comment_id: "123_456",
    status: "OPEN",
    last_message_at: "2026-06-01T10:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "psid-hidden" }
  });
  assert.equal(dto.source_type, "COMMENT");
  assert.equal(dto.source_label, "Comment");
  assert.equal(dto.has_comment_context, true);
  assert.equal(dto.has_private_reply, false);
  assert.equal("provider_comment_id" in dto, false);
});

test("toConversationListItemDto exposes safe connection label without page id", () => {
  const dto = toConversationListItemDto(
    {
      id: "c-fb-conn",
      tenant_id: "t1",
      lead_id: "l1",
      channel_type: "FACEBOOK",
      channel_connection_id: "conn-1",
      provider_page_id: "541846535668129",
      status: "OPEN",
      last_message_at: "2026-06-01T10:00:00.000Z",
      unread_count: 0,
      leads: { status: "NEW", external_user_id: "psid" }
    },
    {
      connectionScopeContext: {
        connections: [
          {
            id: "conn-1",
            tenantId: "t1",
            provider: "FACEBOOK",
            status: "READY",
            providerAccountId: null,
            providerAccountName: "Customer FB Page",
            providerPageId: "541846535668129",
            providerIgAccountId: null,
            publicConnectionKey: "ccp_test_key_1234567890",
            webhookEndpoint: null,
            webhookActive: true,
            lastInboundVerifiedAt: null,
            lastOutboundVerifiedAt: null,
            lastHealthCheckAt: null,
            lastErrorCode: null,
            lastErrorMessageSafe: null,
            connectedBy: null,
            connectedAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        activeConnections: [],
        settingsFallback: []
      }
    }
  );
  assert.equal(dto.connection_label, "Customer FB Page");
  assert.equal(dto.connection_scope_bucket, "active");
  assert.equal(String(dto.connection_label).includes("5418"), false);
});

test("toConversationListItemDto exposes private reply source without leaking comment id", () => {
  const dto = toConversationListItemDto({
    id: "c-ig-pr",
    tenant_id: "t1",
    lead_id: "l1",
    channel_type: "INSTAGRAM",
    channel_thread_id: "ig:comment:17841400000000000_1234567890",
    provider_thread_type: "INSTAGRAM_COMMENT",
    private_reply_sent_at: "2026-06-01T11:00:00.000Z",
    provider_comment_id: "17841400000000000_1234567890",
    status: "OPEN",
    last_message_at: "2026-06-01T11:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "ig-user" }
  });
  assert.equal(dto.source_type, "PRIVATE_REPLY");
  assert.equal(dto.has_private_reply, true);
  assert.equal("provider_comment_id" in dto, false);
  assert.equal("private_reply_comment_id" in dto, false);
  assert.ok(dto.source_post_context);
  assert.equal(dto.source_post_context!.source_type, "PRIVATE_REPLY");
  assert.equal(dto.source_post_context!.private_reply_status, "sent");
  const contextSerialized = JSON.stringify(dto.source_post_context);
  assert.equal(contextSerialized.includes("17841400000000000"), false);
  assert.equal(contextSerialized.includes("provider_comment"), false);
});

test("toConversationListItemDto exposes source_post_context for Facebook comment", () => {
  const dto = toConversationListItemDto({
    id: "c-fb-comment-ctx",
    tenant_id: "t1",
    lead_id: "l1",
    channel_type: "FACEBOOK",
    channel_thread_id: "comment:123_456",
    provider_thread_type: "FACEBOOK_COMMENT",
    provider_comment_id: "123_456",
    last_message_preview: "Is this still available?",
    last_customer_message_at: "2026-06-01T10:00:00.000Z",
    status: "OPEN",
    last_message_at: "2026-06-01T10:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "psid-hidden" }
  });
  assert.ok(dto.source_post_context);
  assert.equal(dto.source_post_context!.channel_type, "FACEBOOK");
  assert.equal(dto.source_post_context!.source_type, "COMMENT");
  assert.equal(dto.source_post_context!.lead_comment_snippet, "Is this still available?");
  assert.equal(dto.source_post_context!.fallback_message, null);
});

test("toConversationListItemDto returns null source_post_context for LINE DM", () => {
  const dto = toConversationListItemDto({
    id: "c-line",
    tenant_id: "t1",
    lead_id: "l1",
    channel_type: "LINE",
    channel_thread_id: "U-line",
    status: "OPEN",
    last_message_at: "2026-06-01T10:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "U-line" }
  });
  assert.equal(dto.source_post_context, null);
});

test("toConversationListItemDto maps enriched source_post_snippet into source_post_context", () => {
  const dto = toConversationListItemDto({
    id: "c-fb-enriched",
    tenant_id: "t1",
    lead_id: "l1",
    channel_type: "FACEBOOK",
    channel_thread_id: "comment:123_456",
    provider_thread_type: "FACEBOOK_COMMENT",
    last_message_preview: "Is this still available?",
    source_post_snippet: "Summer sale starts this weekend.",
    status: "OPEN",
    last_message_at: "2026-06-01T10:00:00.000Z",
    unread_count: 0,
    leads: { status: "NEW", external_user_id: "psid-hidden" }
  });
  assert.equal(dto.source_post_context?.post_snippet, "Summer sale starts this weekend.");
  assert.equal(dto.source_post_context?.fallback_message, null);
  const serialized = JSON.stringify(dto.source_post_context);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("secret"), false);
});
