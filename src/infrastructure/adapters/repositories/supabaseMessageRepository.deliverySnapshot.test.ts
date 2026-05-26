import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseMessageRepository } from "./supabaseMessageRepository.js";

test("getDeliverySnapshot maps metadata delivery_status", async () => {
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _id: string) => ({
          maybeSingle: async () => ({
            data: {
              external_message_id: null,
              metadata_json: { delivery_status: "FAILED", reason: "x" }
            },
            error: null
          })
        })
      })
    })
  } as any;

  const repo = new SupabaseMessageRepository(supabase);
  const snap = await repo.getDeliverySnapshot("msg-1");
  assert.deepEqual(snap, { externalMessageId: null, deliveryStatus: "FAILED" });
});
