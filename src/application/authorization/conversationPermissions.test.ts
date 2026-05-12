import test from "node:test";
import assert from "node:assert/strict";
import { canReplyToConversation, canUpdateConversationStatus } from "./conversationPermissions.js";
import type { AuthContext } from "../../interfaces/api/auth.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function ctx(overrides: Partial<AuthContext>): AuthContext {
  return {
    tenantId: TENANT,
    userId: "00000000-0000-4000-8000-000000000001",
    email: "u@example.com",
    role: "SALES",
    salesAgentId: AGENT_SELF,
    ...overrides
  };
}

test("ADMIN same tenant can reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "ADMIN", salesAgentId: null }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_OTHER
    }),
    true
  );
});

test("MANAGER same tenant can reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "MANAGER", salesAgentId: null }), {
      tenantId: TENANT,
      assignedAgentId: null
    }),
    true
  );
});

test("SALES assigned to self can reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_SELF
    }),
    true
  );
});

test("SALES unassigned conversation cannot reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: null
    }),
    false
  );
});

test("SALES assigned to other cannot reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_OTHER
    }),
    false
  );
});

test("SALES missing salesAgentId cannot reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "SALES", salesAgentId: null }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_SELF
    }),
    false
  );
});

test("cross-tenant cannot reply", () => {
  assert.equal(
    canReplyToConversation(ctx({ role: "MANAGER" }), {
      tenantId: "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650",
      assignedAgentId: null
    }),
    false
  );
});

test("MANAGER can update conversation status in tenant", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "MANAGER", salesAgentId: null }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_OTHER
    }),
    true
  );
});

test("ADMIN can update conversation status in tenant", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "ADMIN", salesAgentId: null }), {
      tenantId: TENANT,
      assignedAgentId: null
    }),
    true
  );
});

test("SALES can update status when assigned to self", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_SELF
    }),
    true
  );
});

test("SALES cannot update status when unassigned", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: null
    }),
    false
  );
});

test("SALES cannot update status for other agent", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "SALES", salesAgentId: AGENT_SELF }), {
      tenantId: TENANT,
      assignedAgentId: AGENT_OTHER
    }),
    false
  );
});

test("cross-tenant cannot update conversation status", () => {
  assert.equal(
    canUpdateConversationStatus(ctx({ role: "MANAGER" }), {
      tenantId: "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650",
      assignedAgentId: null
    }),
    false
  );
});
