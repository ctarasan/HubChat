import test from "node:test";
import assert from "node:assert/strict";
import { UpdateConversationStatusUseCase } from "./updateConversationStatus.js";
import type { Conversation } from "../../domain/entities.js";
import type { AuthContext } from "../../interfaces/api/auth.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const CONV = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const AGENT_A = "4b241101-e2bb-4955-9933-fd6a836e82f9";
const AGENT_B = "5b241101-e2bb-4955-9933-fd6a836e82fa";
const LEAD = "6b241101-e2bb-4955-9933-fd6a836e82fb";

function auth(overrides: Partial<AuthContext>): AuthContext {
  return {
    tenantId: TENANT,
    userId: "7b241101-e2bb-4955-9933-fd6a836e82fc",
    email: "u@example.com",
    role: "MANAGER",
    salesAgentId: AGENT_B,
    ...overrides
  };
}

function baseConv(overrides?: Partial<Conversation>): Conversation {
  return {
    id: CONV,
    tenantId: TENANT,
    leadId: LEAD,
    channelType: "LINE",
    channelThreadId: "t1",
    status: "OPEN",
    lastMessageAt: new Date(),
    assignedAgentId: null,
    resolvedAt: null,
    ...overrides
  };
}

function makeUseCase(initial: Conversation) {
  let conv: Conversation = { ...initial };
  const updates: Array<{ status: string; resolvedAtIso: string | null }> = [];
  const events: Array<Record<string, unknown>> = [];

  const useCase = new UpdateConversationStatusUseCase({
    conversationRepository: {
      findById: async (tenantId, conversationId) => {
        if (conversationId !== CONV) return null;
        if (tenantId !== conv.tenantId) return null;
        return { ...conv };
      },
      updateConversationStatus: async (input) => {
        updates.push({ status: input.status, resolvedAtIso: input.resolvedAtIso });
        conv = {
          ...conv,
          status: input.status,
          resolvedAt: input.resolvedAtIso ? new Date(input.resolvedAtIso) : null
        };
      }
    },
    conversationEventRepository: {
      create: async (input) => {
        events.push({ ...input });
      }
    }
  });

  return { useCase, getConv: () => ({ ...conv }), updates, events };
}

test("MANAGER can set RESOLVED and sets resolved_at", async () => {
  const { useCase, updates, events } = makeUseCase(baseConv());
  const out = await useCase.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    nextStatus: "RESOLVED"
  });
  assert.equal(out.status, "RESOLVED");
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.status, "RESOLVED");
  assert.ok(updates[0]?.resolvedAtIso);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "CONVERSATION_STATUS_CHANGED");
  assert.deepEqual(events[0]?.oldValue, { status: "OPEN" });
  assert.deepEqual(events[0]?.newValue, { status: "RESOLVED" });
});

test("RESOLVED reopen to OPEN clears resolved_at", async () => {
  const t0 = new Date("2020-01-01T00:00:00.000Z");
  const { useCase, updates } = makeUseCase(
    baseConv({ status: "RESOLVED", resolvedAt: t0, assignedAgentId: AGENT_A })
  );
  await useCase.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    nextStatus: "OPEN"
  });
  assert.equal(updates[0]?.status, "OPEN");
  assert.equal(updates[0]?.resolvedAtIso, null);
});

test("ARCHIVED preserves existing resolved_at", async () => {
  const t0 = new Date("2020-01-01T00:00:00.000Z");
  const { useCase, updates } = makeUseCase(
    baseConv({ status: "RESOLVED", resolvedAt: t0, assignedAgentId: AGENT_A })
  );
  await useCase.execute({
    auth: auth({ role: "MANAGER" }),
    conversationId: CONV,
    nextStatus: "ARCHIVED"
  });
  assert.equal(updates[0]?.status, "ARCHIVED");
  assert.equal(updates[0]?.resolvedAtIso, t0.toISOString());
});

test("SALES can update when assigned to self", async () => {
  const { useCase } = makeUseCase(baseConv({ assignedAgentId: AGENT_A }));
  await useCase.execute({
    auth: auth({ role: "SALES", salesAgentId: AGENT_A }),
    conversationId: CONV,
    nextStatus: "PENDING"
  });
});

test("assigned SALES can set OPEN to RESOLVED with resolved_at", async () => {
  const { useCase, updates } = makeUseCase(baseConv({ assignedAgentId: AGENT_A }));
  const out = await useCase.execute({
    auth: auth({ role: "SALES", salesAgentId: AGENT_A }),
    conversationId: CONV,
    nextStatus: "RESOLVED"
  });
  assert.equal(out.status, "RESOLVED");
  assert.equal(updates[0]?.status, "RESOLVED");
  assert.ok(updates[0]?.resolvedAtIso);
});

test("SALES cannot update unassigned conversation", async () => {
  const { useCase } = makeUseCase(baseConv({ assignedAgentId: null }));
  await assert.rejects(
    () =>
      useCase.execute({
        auth: auth({ role: "SALES", salesAgentId: AGENT_A }),
        conversationId: CONV,
        nextStatus: "PENDING"
      }),
    /Forbidden conversation status update/
  );
});

test("SALES cannot update other agent conversation", async () => {
  const { useCase } = makeUseCase(baseConv({ assignedAgentId: AGENT_B }));
  await assert.rejects(
    () =>
      useCase.execute({
        auth: auth({ role: "SALES", salesAgentId: AGENT_A }),
        conversationId: CONV,
        nextStatus: "PENDING"
      }),
    /Forbidden conversation status update/
  );
});

test("cross-tenant conversation not found", async () => {
  const { useCase } = makeUseCase(baseConv({ tenantId: OTHER_TENANT }));
  await assert.rejects(
    () =>
      useCase.execute({
        auth: auth({ role: "MANAGER" }),
        conversationId: CONV,
        nextStatus: "PENDING"
      }),
    /Conversation not found/
  );
});

/** Methods read `this` — fails if use case detaches repository methods before calling. */
class BindingSensitiveStatusRepository {
  readonly supabase = { bound: true };
  readonly updates: Array<{ status: string; resolvedAtIso: string | null }> = [];

  constructor(private conv: Conversation) {}

  async findById(tenantId: string, conversationId: string): Promise<Conversation | null> {
    if (!this.supabase) throw new TypeError("Cannot read properties of undefined (reading 'supabase')");
    if (tenantId !== this.conv.tenantId || conversationId !== this.conv.id) return null;
    return { ...this.conv };
  }

  async updateConversationStatus(input: {
    tenantId: string;
    conversationId: string;
    status: Conversation["status"];
    resolvedAtIso: string | null;
  }): Promise<void> {
    if (!this.supabase) throw new TypeError("Cannot read properties of undefined (reading 'supabase')");
    this.updates.push({ status: input.status, resolvedAtIso: input.resolvedAtIso });
    this.conv = {
      ...this.conv,
      status: input.status,
      resolvedAt: input.resolvedAtIso ? new Date(input.resolvedAtIso) : null
    };
  }
}

test("assigned SALES RESOLVED preserves repository this binding", async () => {
  const repo = new BindingSensitiveStatusRepository(
    baseConv({ assignedAgentId: AGENT_A })
  );
  const useCase = new UpdateConversationStatusUseCase({
    conversationRepository: repo,
    conversationEventRepository: { create: async () => {} }
  });
  const out = await useCase.execute({
    auth: auth({ role: "SALES", salesAgentId: AGENT_A }),
    conversationId: CONV,
    nextStatus: "RESOLVED"
  });
  assert.equal(out.status, "RESOLVED");
  assert.ok(out.resolvedAt);
  assert.equal(repo.updates.length, 1);
  assert.equal(repo.updates[0]?.status, "RESOLVED");
  assert.ok(repo.updates[0]?.resolvedAtIso);
});
