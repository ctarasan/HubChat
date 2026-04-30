import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseOutboundCommandRepository } from "./supabaseOutboundCommandRepository.js";

test("createOutboundMessageAndOutbox forwards conversationIds into queue payload RPC input", async () => {
  let rpcName = "";
  let rpcInput: any = null;
  const repo = new SupabaseOutboundCommandRepository({
    rpc: async (name: string, input: Record<string, unknown>) => {
      rpcName = name;
      rpcInput = input;
      return { data: [{ message_id: "msg-1" }], error: null };
    }
  } as any);

  await repo.createOutboundMessageAndOutbox({
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    conversationId: "comment-conv",
    conversationIds: ["comment-conv", "dm-conv"],
    channel: "FACEBOOK",
    channelThreadId: "user:987654",
    content: "hello"
  });

  assert.equal(rpcName, "create_outbound_message_with_outbox");
  assert.deepEqual(rpcInput?.p_conversation_ids, ["comment-conv", "dm-conv"]);
});
