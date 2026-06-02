import test from "node:test";
import assert from "node:assert/strict";
import { ProcessInboundMessageUseCase } from "./processInboundMessage.js";
import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import {
  buildDefaultTenantSlaPolicy,
  type TenantSlaPolicy,
  type TenantSlaPolicyRecord
} from "../../domain/tenantSlaPolicy.js";

function makePayload(overrides?: Partial<InboundMessageNormalizedPayload>): InboundMessageNormalizedPayload {
  return {
    tenantId: "tenant-sla-2",
    channel: "LINE",
    externalUserId: "U123",
    externalMessageId: "m-1",
    channelThreadId: "U123",
    text: "hello",
    occurredAt: new Date("2026-05-15T10:00:00.000Z").toISOString(),
    ...overrides
  };
}

function slaPolicyRepoReturning(policy: TenantSlaPolicy) {
  const record: TenantSlaPolicyRecord = {
    ...policy,
    tenantId: "tenant-sla-2",
    updatedAt: "2026-06-01T00:00:00.000Z",
    updatedByAuthUserId: null
  };
  return {
    findByTenantId: async () => record
  };
}

function baseLead() {
  return {
    id: "lead-1",
    tenantId: "tenant-sla-2",
    sourceChannel: "LINE" as const,
    externalUserId: "U123",
    name: null,
    phone: null,
    email: null,
    status: "ASSIGNED" as const,
    assignedSalesId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastContactAt: null,
    tags: [] as string[]
  };
}

function baseDeps(overrides: {
  conversation?: Record<string, unknown> | null;
  createCapture?: (data: Record<string, unknown>) => void;
  touchCapture?: (opts: Record<string, unknown>) => void;
  slaPolicyRepository?: { findByTenantId: (tenantId: string) => Promise<TenantSlaPolicyRecord | null> };
}) {
  return {
    leadRepository: {
      findById: async () => null,
      findByExternalUser: async () => baseLead(),
      create: async () => {
        throw new Error("not used");
      },
      updateStatus: async () => {},
      assign: async () => {},
      list: async () => ({ items: [], nextCursor: null })
    },
    conversationRepository: {
      findByThread: async () => overrides.conversation ?? null,
      create: async (data: Record<string, unknown>) => {
        overrides.createCapture?.(data);
        return { id: "conv-new", ...data };
      },
      touchLastMessage: async (_id: string, _at: Date, opts: Record<string, unknown>) => {
        overrides.touchCapture?.(opts);
      },
      list: async () => ({ items: [], nextCursor: null }),
      markAsRead: async () => {}
    },
    messageRepository: {
      create: async (d: Record<string, unknown>) => ({ id: "msg-1", ...d, createdAt: new Date() }),
      markSent: async () => {},
      markFailed: async () => {},
      listByConversation: async () => ({ items: [], nextCursor: null })
    },
    activityLogRepository: { create: async () => {} },
    contactRepository: {
      getOrCreateByIdentity: async () => ({
        id: "c1",
        tenantId: "tenant-sla-2",
        displayName: "User",
        phone: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      upsertIdentityProfile: async () => ({ contactIdentityId: "identity-1", contactId: "c1", displayName: "User", profileImageUrl: null })
    },
    channelAccountRepository: { findByTenantAndChannel: async () => null },
    slaPolicyRepository: overrides.slaPolicyRepository
  };
}

function policyWithRuleMinutes(
  key: "NEW_FIRST_RESPONSE" | "ONGOING_INBOUND_RESPONSE" | "REOPENED_RESPONSE",
  minutes: number,
  extra?: Partial<TenantSlaPolicy>
): TenantSlaPolicy {
  const base = buildDefaultTenantSlaPolicy();
  return {
    ...base,
    ...extra,
    rules: {
      ...base.rules,
      [key]: {
        ...base.rules[key],
        enabled: true,
        targetMinutes: minutes
      }
    }
  };
}

test("new conversation uses NEW_FIRST_RESPONSE targetMinutes from tenant policy", async () => {
  const customerAt = new Date("2026-05-15T10:00:00.000Z");
  let createData: Record<string, unknown> | undefined;
  const policy = policyWithRuleMinutes("NEW_FIRST_RESPONSE", 90);
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      slaPolicyRepository: slaPolicyRepoReturning(policy),
      createCapture: (data) => {
        createData = data;
      }
    }) as any
  );

  await useCase.execute(makePayload({ occurredAt: customerAt.toISOString() }));
  const slaDueAt = createData?.slaDueAt as Date;
  assert.ok(slaDueAt instanceof Date);
  assert.equal(slaDueAt.getTime() - customerAt.getTime(), 90 * 60_000);
});

test("existing conversation with first_response_at uses ONGOING_INBOUND_RESPONSE targetMinutes", async () => {
  const customerAt = new Date("2026-05-15T10:00:00.000Z");
  let touchOpts: Record<string, unknown> | undefined;
  const policy = policyWithRuleMinutes("ONGOING_INBOUND_RESPONSE", 45);
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      conversation: {
        id: "conv-1",
        tenantId: "tenant-sla-2",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "OPEN",
        lastMessageAt: new Date(),
        firstResponseAt: new Date("2026-05-14T08:00:00.000Z")
      },
      slaPolicyRepository: slaPolicyRepoReturning(policy),
      touchCapture: (opts) => {
        touchOpts = opts;
      }
    }) as any
  );

  await useCase.execute(makePayload({ occurredAt: customerAt.toISOString() }));
  const slaDueAt = touchOpts?.slaDueAt as Date;
  assert.ok(slaDueAt instanceof Date);
  assert.equal(slaDueAt.getTime() - customerAt.getTime(), 45 * 60_000);
});

test("resolved inbound reopen uses REOPENED_RESPONSE targetMinutes from tenant policy", async () => {
  const customerAt = new Date("2026-05-10T10:00:00.000Z");
  let touchOpts: Record<string, unknown> | undefined;
  const policy = policyWithRuleMinutes("REOPENED_RESPONSE", 30);
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      conversation: {
        id: "conv-1",
        tenantId: "tenant-sla-2",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "RESOLVED",
        lastMessageAt: new Date(),
        resolvedAt: new Date("2026-05-09T00:00:00.000Z"),
        firstResponseAt: new Date("2026-05-08T00:00:00.000Z")
      },
      slaPolicyRepository: slaPolicyRepoReturning(policy),
      touchCapture: (opts) => {
        touchOpts = opts;
      }
    }) as any
  );

  await useCase.execute(makePayload({ occurredAt: customerAt.toISOString(), text: "follow-up" }));
  assert.equal(touchOpts?.reopenFromResolved, true);
  const slaDueAt = touchOpts?.slaDueAt as Date;
  assert.ok(slaDueAt instanceof Date);
  assert.equal(slaDueAt.getTime() - customerAt.getTime(), 30 * 60_000);
});

test("disabled tenant policy does not set sla_due_at on new conversation", async () => {
  let createData: Record<string, unknown> | undefined;
  const policy = { ...buildDefaultTenantSlaPolicy(), enabled: false };
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      slaPolicyRepository: slaPolicyRepoReturning(policy),
      createCapture: (data) => {
        createData = data;
      }
    }) as any
  );

  await useCase.execute(makePayload());
  assert.equal(createData?.slaDueAt, undefined);
});

test("ARCHIVED conversation with excludeArchived does not set sla_due_at", async () => {
  let touchOpts: Record<string, unknown> | undefined;
  const policy = { ...buildDefaultTenantSlaPolicy(), excludeArchived: true };
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      conversation: {
        id: "conv-archived",
        tenantId: "tenant-sla-2",
        leadId: "lead-1",
        channelType: "LINE",
        channelThreadId: "U123",
        status: "ARCHIVED",
        lastMessageAt: new Date()
      },
      slaPolicyRepository: slaPolicyRepoReturning(policy),
      touchCapture: (opts) => {
        touchOpts = opts;
      }
    }) as any
  );

  await useCase.execute(makePayload());
  assert.equal(touchOpts?.slaDueAt, undefined);
});

test("default policy path matches centralized factory targetMinutes for new conversation", async () => {
  const customerAt = new Date("2026-05-15T10:00:00.000Z");
  let createData: Record<string, unknown> | undefined;
  const useCase = new ProcessInboundMessageUseCase(
    baseDeps({
      createCapture: (data) => {
        createData = data;
      }
    }) as any
  );

  await useCase.execute(makePayload({ occurredAt: customerAt.toISOString() }));
  const expectedMinutes = buildDefaultTenantSlaPolicy().rules.NEW_FIRST_RESPONSE.targetMinutes!;
  const slaDueAt = createData?.slaDueAt as Date;
  assert.ok(slaDueAt instanceof Date);
  assert.equal(slaDueAt.getTime() - customerAt.getTime(), expectedMinutes * 60_000);
});
