import test from "node:test";
import assert from "node:assert/strict";
import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import { SupabaseMessageRepository } from "../../infrastructure/adapters/repositories/supabaseMessageRepository.js";
import {
  INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING,
  RetryableOutboundDeliveryError
} from "../../lib/outboundDeliveryError.js";
import { SendOutboundMessageUseCase } from "./sendOutboundMessage.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeSupabaseMessageRepo(snapshot: { delivery_status?: string; external_message_id?: string | null }) {
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _id: string) => ({
          maybeSingle: async () => ({
            data: {
              external_message_id: snapshot.external_message_id ?? null,
              metadata_json: { delivery_status: snapshot.delivery_status ?? "PENDING" }
            },
            error: null
          })
        })
      })
    })
  } as any;
  return new SupabaseMessageRepository(supabase);
}

function basePayload(messageId: string): OutboundMessageRequestedPayload {
  return {
    tenantId: TENANT_ID,
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    messageId,
    conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
    channel: "INSTAGRAM",
    channelThreadId: "ig:user:959986016929726",
    content: "hello"
  };
}

function useCaseWithRepository(messageRepository: SupabaseMessageRepository) {
  let sendCount = 0;
  return {
    useCase: new SendOutboundMessageUseCase({
      channelAdapterRegistry: {
        get: () => ({
          channel: "INSTAGRAM",
          receiveMessage: async () => {
            throw new Error("not used");
          },
          sendMessage: async () => {
            sendCount += 1;
            return { externalMessageId: "ext-1" };
          },
          fetchUserProfile: async () => ({}),
          fetchConversationThread: async () => []
        })
      },
      messageRepository,
      activityLogRepository: { create: async () => {} },
      rateLimiter: { checkOrThrow: async () => {} },
      idempotency: {
        hasProcessed: async () => true,
        markProcessed: async () => {}
      }
    }),
    sendCount: () => sendCount
  };
}

test("detached SupabaseMessageRepository.getDeliverySnapshot loses repository binding", async () => {
  const repository = makeSupabaseMessageRepo({ delivery_status: "SENT" });
  const detached = repository.getDeliverySnapshot;
  await assert.rejects(
    () => detached("msg-detached-1"),
    (err: Error) => err.message.includes("supabase") || err.message.includes("findInternal")
  );
});

test("idempotency skip calls getDeliverySnapshot on repository instance without TypeError", async () => {
  const repository = makeSupabaseMessageRepo({ delivery_status: "SENT", external_message_id: "mid-1" });
  const { useCase, sendCount } = useCaseWithRepository(repository);

  await useCase.execute(basePayload("msg-bound-sent-1"));

  assert.equal(sendCount(), 0);
});

test("idempotency skip with PENDING snapshot throws OUTBOUND_IDEMPOTENCY_PENDING not TypeError", async () => {
  const repository = makeSupabaseMessageRepo({ delivery_status: "PENDING" });
  const { useCase, sendCount } = useCaseWithRepository(repository);

  await assert.rejects(
    () => useCase.execute(basePayload("msg-bound-pending-1")),
    (err: unknown) => {
      assert.ok(err instanceof RetryableOutboundDeliveryError);
      assert.equal(err.deliveryErrorCode, INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING);
      assert.equal(String(err).includes("supabase"), false);
      return true;
    }
  );
  assert.equal(sendCount(), 0);
});

test("idempotency skip with FAILED snapshot is safe no-op", async () => {
  const repository = makeSupabaseMessageRepo({ delivery_status: "FAILED" });
  const { useCase, sendCount } = useCaseWithRepository(repository);

  await useCase.execute(basePayload("msg-bound-failed-1"));

  assert.equal(sendCount(), 0);
});
