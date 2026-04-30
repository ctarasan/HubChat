import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseConversationRepository } from "./supabaseConversationRepository.js";

test("touchLastMessage increments unread_count when requested", async () => {
  let incrementCalled = false;
  let patched: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_key: string, _value: string) => ({
          maybeSingle: () => Promise.resolve({ data: { unread_count: 2 }, error: null })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        patched = patch;
        return {
          eq: (_key: string, _value: string) => {
            incrementCalled = true;
            return Promise.resolve({ error: null });
          }
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.touchLastMessage("conv-1", new Date(), {
    incrementUnreadCount: true,
    lastMessagePreview: "hello",
    lastMessageType: "TEXT"
  });
  assert.equal(incrementCalled, true);
  assert.equal(patched.unread_count, 3);
  assert.equal(patched.last_message_preview, "hello");
  assert.equal(patched.last_message_type, "TEXT");
});

test("markAsRead resets unread_count and sets last_read_at", async () => {
  let patch: any = null;
  let tenantEq: string | null = null;
  let idEq: string | null = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (nextPatch: Record<string, unknown>) => {
        patch = nextPatch;
        return {
          eq: (key: string, value: string) => {
            if (key === "tenant_id") tenantEq = value;
            if (key === "id") idEq = value;
            if (key === "id") return Promise.resolve({ error: null });
            return {
              eq: (k2: string, v2: string) => {
                if (k2 === "id") idEq = v2;
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
    })
  } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.markAsRead({ tenantId: "tenant-1", conversationId: "conv-1" });
  assert.equal(tenantEq, "tenant-1");
  assert.equal(idEq, "conv-1");
  assert.equal(patch.unread_count, 0);
  assert.equal(typeof patch.last_read_at, "string");
});

test("findFacebookMessengerDmByParticipant returns only valid user-target DM row", async () => {
  const query: any = {
    select: () => query,
    eq: () => query,
    not: () => query,
    like: () => query,
    order: () => query,
    limit: async () => ({
      error: null,
      data: [
        {
          id: "conv-valid",
          tenant_id: "tenant-1",
          lead_id: "lead-1",
          channel_type: "FACEBOOK",
          channel_thread_id: "user:27244508575134096",
          provider_thread_type: "MESSENGER_DM",
          provider_page_id: "1137356672785125",
          provider_external_user_id: "27244508575134096",
          status: "OPEN",
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: "conv-invalid",
          tenant_id: "tenant-1",
          lead_id: "lead-1",
          channel_type: "FACEBOOK",
          channel_thread_id: "122098025780693891_1278672180548121",
          provider_thread_type: "MESSENGER_DM",
          provider_page_id: "1137356672785125",
          provider_external_user_id: "27244508575134096",
          status: "OPEN",
          last_message_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString()
        }
      ]
    })
  };
  const fakeSupabase = {
    from: (_table: string) => query
  } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  const found = await repo.findFacebookMessengerDmByParticipant({
    tenantId: "tenant-1",
    providerPageId: "1137356672785125",
    providerExternalUserId: "27244508575134096"
  });
  assert.equal(found?.id, "conv-valid");
  assert.equal(found?.channelThreadId, "user:27244508575134096");
});
