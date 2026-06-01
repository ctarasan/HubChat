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
