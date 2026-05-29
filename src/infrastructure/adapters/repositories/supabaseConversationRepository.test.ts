import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseConversationRepository } from "./supabaseConversationRepository.js";
import { encodeRepoCursor } from "./cursorPagination.js";

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

test("touchLastMessage writes last_customer_message_at when provided", async () => {
  let patched: any = null;
  const at = new Date("2026-05-01T12:00:00.000Z");
  const customerAt = new Date("2026-05-01T12:00:01.000Z");
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        patched = patch;
        return {
          eq: (_key: string, _value: string) => Promise.resolve({ error: null })
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.touchLastMessage("conv-1", at, { lastCustomerMessageAt: customerAt });
  assert.equal(patched.last_customer_message_at, customerAt.toISOString());
  assert.equal(patched.last_message_at, at.toISOString());
});

test("recordAgentOutboundSent sets last_agent_message_at and first_response_at once when customer message exists", async () => {
  const sentAt = new Date("2026-05-02T15:00:00.000Z");
  const lastCustomer = new Date("2026-05-02T14:00:00.000Z");
  let selectCalls = 0;
  let lastUpdatePatch: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_k1: string, _v1: string) => ({
          eq: (_k2: string, _v2: string) => ({
            maybeSingle: () => {
              selectCalls += 1;
              return Promise.resolve({
                data: { first_response_at: null, last_customer_message_at: lastCustomer.toISOString() },
                error: null
              });
            }
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        lastUpdatePatch = patch;
        return {
          eq: (_k1: string, _v1: string) => ({
            eq: (_k2: string, _v2: string) => Promise.resolve({ error: null })
          })
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.recordAgentOutboundSent({ tenantId: "tenant-1", conversationId: "conv-1", sentAt });
  assert.equal(selectCalls, 1);
  assert.equal(lastUpdatePatch?.last_agent_message_at, sentAt.toISOString());
  assert.equal(lastUpdatePatch?.first_response_at, sentAt.toISOString());
  assert.equal(lastUpdatePatch?.sla_due_at, null);
});

test("recordAgentOutboundSent does not set first_response_at when last_customer_message_at is null", async () => {
  const sentAt = new Date("2026-05-02T15:00:00.000Z");
  let lastUpdatePatch: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { first_response_at: null, last_customer_message_at: null },
                error: null
              })
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        lastUpdatePatch = patch;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.recordAgentOutboundSent({ tenantId: "t", conversationId: "c1", sentAt });
  assert.equal(lastUpdatePatch?.last_agent_message_at, sentAt.toISOString());
  assert.equal(Object.prototype.hasOwnProperty.call(lastUpdatePatch ?? {}, "first_response_at"), false);
});

test("recordAgentOutboundSent does not set first_response_at when sentAt is before last_customer_message_at", async () => {
  const lastCustomer = new Date("2026-05-02T16:00:00.000Z");
  const sentAt = new Date("2026-05-02T15:00:00.000Z");
  let lastUpdatePatch: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { first_response_at: null, last_customer_message_at: lastCustomer.toISOString() },
                error: null
              })
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        lastUpdatePatch = patch;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.recordAgentOutboundSent({ tenantId: "t", conversationId: "c1", sentAt });
  assert.equal(lastUpdatePatch?.last_agent_message_at, sentAt.toISOString());
  assert.equal(Object.prototype.hasOwnProperty.call(lastUpdatePatch ?? {}, "first_response_at"), false);
});

test("recordAgentOutboundSent second send does not overwrite first_response_at", async () => {
  const firstSent = new Date("2026-05-02T15:00:00.000Z");
  const secondSent = new Date("2026-05-02T16:00:00.000Z");
  const lastCustomer = new Date("2026-05-02T14:00:00.000Z");
  let readCount = 0;
  let lastUpdatePatch: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => {
              readCount += 1;
              const firstAlready = readCount > 1;
              return Promise.resolve({
                data: {
                  first_response_at: firstAlready ? firstSent.toISOString() : null,
                  last_customer_message_at: lastCustomer.toISOString()
                },
                error: null
              });
            }
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        lastUpdatePatch = patch;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        };
      }
    })
  } as any;

  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.recordAgentOutboundSent({ tenantId: "t", conversationId: "c1", sentAt: firstSent });
  await repo.recordAgentOutboundSent({ tenantId: "t", conversationId: "c1", sentAt: secondSent });
  assert.equal(lastUpdatePatch?.last_agent_message_at, secondSent.toISOString());
  assert.equal(Object.prototype.hasOwnProperty.call(lastUpdatePatch ?? {}, "first_response_at"), false);
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

test("updateConversationFollowUp sets only provided follow-up columns and updated_at", async () => {
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
  const at = new Date("2026-05-15T09:00:00.000Z");
  await repo.updateConversationFollowUp({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    patch: { followUpAt: at }
  });
  assert.equal(tenantEq, "tenant-1");
  assert.equal(idEq, "conv-1");
  assert.equal(patch.follow_up_at, at.toISOString());
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "follow_up_note"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "sla_due_at"), false);
  assert.equal(typeof patch.updated_at, "string");
});

test("updateConversationFollowUp null clears follow_up columns", async () => {
  let patch: any = null;
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (nextPatch: Record<string, unknown>) => {
        patch = nextPatch;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        };
      }
    })
  } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.updateConversationFollowUp({
    tenantId: "t",
    conversationId: "c1",
    patch: { followUpAt: null, followUpNote: null }
  });
  assert.equal(patch.follow_up_at, null);
  assert.equal(patch.follow_up_note, null);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "sla_due_at"), false);
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

test("touchLastMessage can set sla_due_at and reopen resolved conversation", async () => {
  const at = new Date("2026-05-02T12:00:00.000Z");
  const slaDue = new Date("2026-05-03T12:00:00.000Z");
  let patched: Record<string, unknown> = {};
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        patched = patch;
        return { eq: () => Promise.resolve({ error: null }) };
      }
    })
  } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.touchLastMessage("conv-1", at, {
    slaDueAt: slaDue,
    reopenFromResolved: true,
    lastCustomerMessageAt: at
  });
  assert.equal(patched.sla_due_at, slaDue.toISOString());
  assert.equal(patched.status, "OPEN");
  assert.equal(patched.resolved_at, null);
});

test("list applies team assignment and inbox filter query steps", async () => {
  const calls: string[] = [];
  const query: any = {
    select: () => query,
    eq: (col: string, val: string) => {
      calls.push(`eq:${col}:${val}`);
      return query;
    },
    order: () => query,
    limit: () => query,
    is: (col: string, val: null) => {
      calls.push(`is:${col}:${val === null ? "null" : String(val)}`);
      return query;
    },
    not: (col: string, op: string, val: unknown) => {
      calls.push(`not:${col}:${op}:${String(val)}`);
      return query;
    },
    filter: (col: string, op: string, val: string) => {
      calls.push(`filter:${col}:${op}:${val}`);
      return query;
    },
    or: (expr: string) => {
      calls.push(`or:${expr}`);
      return query;
    },
    async then(resolve: (v: unknown) => void) {
      resolve({ data: [], error: null });
    }
  };
  const fakeSupabase = { from: () => query } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.list({
    tenantId: "tenant-1",
    limit: 10,
    assignmentFilter: "team",
    assignedAgentId: "agent-1",
    inboxFilters: {
      leadManagementStatus: "FOLLOW_UP",
      waiting: "needs_response"
    }
  });
  assert.equal(calls.some((c) => c === "not:assigned_agent_id:is:null"), true);
  assert.equal(calls.some((c) => c === "eq:assigned_agent_id:agent-1"), true);
  assert.equal(calls.some((c) => c.startsWith("not:follow_up_at:is:null")), true);
  assert.equal(calls.some((c) => c === "not:last_customer_message_at:is:null"), true);
  assert.equal(calls.some((c) => c.includes("last_customer_message_at.gt.last_agent_message_at")), false);
});

test("list production action filter sla due_soon and waiting needs_response", async () => {
  const calls: string[] = [];
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    not: (col: string, op: string, val: unknown) => {
      calls.push(`not:${col}:${op}:${String(val)}`);
      return query;
    },
    gt: (col: string, val: string) => {
      calls.push(`gt:${col}:${val}`);
      return query;
    },
    lte: (col: string, val: string) => {
      calls.push(`lte:${col}:${val}`);
      return query;
    },
    is: () => query,
    filter: () => query,
    or: (expr: string) => {
      calls.push(`or:${expr}`);
      return query;
    },
    async then(resolve: (v: unknown) => void) {
      resolve({ data: [], error: null });
    }
  };
  const repo = new SupabaseConversationRepository({ from: () => query } as any);
  await repo.list({
    tenantId: "tenant-1",
    limit: 25,
    assignmentFilter: "none",
    inboxFilters: { sla: "due_soon", waiting: "needs_response" }
  });
  assert.equal(calls.some((c) => c === "not:last_customer_message_at:is:null"), true);
  assert.equal(calls.some((c) => c.startsWith("gt:sla_due_at:")), true);
  assert.equal(calls.some((c) => c.includes("last_customer_message_at.gt.last_agent_message_at")), false);
});

test("list applies follow_up_none and sla_none before pagination limit", async () => {
  const calls: string[] = [];
  let limitCalled = false;
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => {
      limitCalled = true;
      return query;
    },
    is: (col: string, val: null) => {
      calls.push(`is:${col}:${val === null ? "null" : String(val)}`);
      return query;
    },
    not: () => query,
    filter: () => query,
    or: () => query,
    async then(resolve: (v: unknown) => void) {
      resolve({ data: [], error: null });
    }
  };
  const fakeSupabase = { from: () => query } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.list({
    tenantId: "tenant-1",
    limit: 10,
    inboxFilters: { followUp: "none", sla: "none" }
  });
  assert.deepEqual(calls, ["is:follow_up_at:null", "is:sla_due_at:null"]);
  assert.equal(limitCalled, true);
});

test("updateConversationStatus writes status, resolved_at, and updated_at", async () => {
  let patched: Record<string, unknown> = {};
  const eqCalls: Array<[string, string]> = [];
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          eqCalls.push([col, val]);
          if (eqCalls.length === 2) {
            patched = patch;
            return Promise.resolve({ error: null });
          }
          return { eq: (col2: string, val2: string) => {
            eqCalls.push([col2, val2]);
            patched = patch;
            return Promise.resolve({ error: null });
          } };
        }
      })
    })
  } as any;
  const repo = new SupabaseConversationRepository(fakeSupabase);
  await repo.updateConversationStatus({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    status: "RESOLVED",
    resolvedAtIso: "2026-05-19T12:00:00.000Z"
  });
  assert.equal(patched.status, "RESOLVED");
  assert.equal(patched.resolved_at, "2026-05-19T12:00:00.000Z");
  assert.equal(Object.prototype.hasOwnProperty.call(patched, "follow_up_at"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patched, "follow_up_note"), false);
  assert.ok(patched.updated_at);
  assert.deepEqual(eqCalls, [
    ["tenant_id", "tenant-1"],
    ["id", "conv-1"]
  ]);
});

function makeListForLeadsMenuQueryMock() {
  const orExprs: string[] = [];
  const query: any = {
    select: () => query,
    eq: () => query,
    not: () => query,
    is: () => query,
    filter: () => query,
    order: () => query,
    limit: () => query,
    or: (expr: string) => {
      orExprs.push(expr);
      return query;
    },
    async then(resolve: (v: unknown) => void) {
      resolve({ data: [], error: null });
    }
  };
  return { query, orExprs };
}

test("listForLeadsMenu search uses safe top-level or filter without embedded columns", async () => {
  const { query, orExprs } = makeListForLeadsMenuQueryMock();
  const repo = new SupabaseConversationRepository({ from: () => query } as any);
  await repo.listForLeadsMenu({ tenantId: "tenant-1", limit: 25, search: "Poolsub" });
  assert.equal(orExprs.length, 1);
  const or = orExprs[0]!;
  assert.match(or, /participant_display_name\.ilike\."\*Poolsub\*"/);
  assert.equal(or.includes("leads.name"), false);
  assert.equal(or.includes("contacts.display_name"), false);
});

test("listForLeadsMenu search escapes special characters in or filter", async () => {
  const { query, orExprs } = makeListForLeadsMenuQueryMock();
  const repo = new SupabaseConversationRepository({ from: () => query } as any);
  await repo.listForLeadsMenu({ tenantId: "tenant-1", limit: 25, search: "test,value" });
  const or = orExprs[0]!;
  assert.match(or, /"\*test,value\*"/);
  await repo.listForLeadsMenu({ tenantId: "tenant-1", limit: 25, search: "O'Brien" });
  assert.match(orExprs[1]!, /"\*O'Brien\*"/);
});

test("listForLeadsMenu search with cursor uses single combined or param", async () => {
  const { query, orExprs } = makeListForLeadsMenuQueryMock();
  const repo = new SupabaseConversationRepository({ from: () => query } as any);
  await repo.listForLeadsMenu({
    tenantId: "tenant-1",
    limit: 25,
    search: "111",
    cursor: encodeRepoCursor({ lastMessageAt: "2026-05-29T10:00:00.000Z", id: "c1" })
  });
  assert.equal(orExprs.length, 1);
  assert.match(orExprs[0]!, /^and\(or\(/);
  assert.match(orExprs[0]!, /participant_display_name\.ilike\./);
  assert.match(orExprs[0]!, /last_message_at\.lt\./);
});
