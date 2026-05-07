import test from "node:test";
import assert from "node:assert/strict";
import { filterOwnPlatformAccountConversations } from "./conversationSelfFilter.js";

test("keeps normal Facebook contact when only page id is configured", () => {
  const rows = [
    {
      id: "fb-1",
      channel_type: "FACEBOOK",
      external_user_id: "10009990001",
      participant_display_name: "Chamnan Tarasansombat",
      channel_thread_id: "user:10009990001"
    }
  ];
  const result = filterOwnPlatformAccountConversations(rows, {
    FACEBOOK_PAGE_ID: "1137356672785125"
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "fb-1");
});

test("filters Facebook self account by explicit id blocklist", () => {
  const rows = [
    {
      id: "self-fb",
      channel_type: "FACEBOOK",
      external_user_id: "1137356672785125",
      channel_thread_id: "user:1137356672785125"
    },
    {
      id: "fb-user",
      channel_type: "FACEBOOK",
      external_user_id: "10009990001",
      channel_thread_id: "user:10009990001"
    }
  ];
  const result = filterOwnPlatformAccountConversations(rows, {
    INBOX_SELF_EXTERNAL_IDS: "1137356672785125"
  });
  assert.deepEqual(result.map((x) => x.id), ["fb-user"]);
});

test("filters Instagram self account by configured instagram ids", () => {
  const rows = [
    {
      id: "self-ig",
      channel_type: "INSTAGRAM",
      external_user_id: "799150773054209",
      channel_thread_id: "ig:user:799150773054209"
    },
    {
      id: "ig-user",
      channel_type: "INSTAGRAM",
      external_user_id: "959986016929726",
      channel_thread_id: "ig:user:959986016929726"
    }
  ];
  const result = filterOwnPlatformAccountConversations(rows, {
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "799150773054209"
  });
  assert.deepEqual(result.map((x) => x.id), ["ig-user"]);
});

