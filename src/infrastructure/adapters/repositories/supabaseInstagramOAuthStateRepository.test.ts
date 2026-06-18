import test from "node:test";
import assert from "node:assert/strict";
import { hashInstagramOAuthState } from "../../../lib/instagramOAuthSecurity.js";
import {
  InstagramOAuthStateConflictError,
  InstagramOAuthStateNotFoundError,
  SupabaseInstagramOAuthStateRepository
} from "./supabaseInstagramOAuthStateRepository.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const AGENT = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

function buildRepository(initial: Row[] = []) {
  const states = initial.map((row) => ({ ...row }));

  function applyFilters(rows: Row[], filters: Array<{ kind: string; column: string; value: unknown }>) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.column] === filter.value;
        if (filter.kind === "is") return row[filter.column] === filter.value;
        if (filter.kind === "gt") return String(row[filter.column]) > String(filter.value);
        return true;
      })
    );
  }

  const supabase = {
    from(_table: string) {
      let mode: "insert" | "update" | "select" = "select";
      let insertRow: Row | null = null;
      let updatePatch: Partial<Row> | null = null;
      let filters: Array<{ kind: string; column: string; value: unknown }> = [];
      let maybeSingle = false;

      const builder = {
        insert(row: Row) {
          mode = "insert";
          insertRow = row;
          return builder;
        },
        update(patch: Partial<Row>) {
          mode = "update";
          updatePatch = patch;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push({ kind: "is", column, value });
          return builder;
        },
        gt(column: string, value: unknown) {
          filters.push({ kind: "gt", column, value });
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          maybeSingle = false;
          return builder;
        },
        maybeSingle() {
          maybeSingle = true;
          return builder;
        },
        then(resolve: (value: { data: Row | null; error: null }) => void) {
          if (mode === "insert" && insertRow) {
            const row = { id: `state-${states.length + 1}`, ...insertRow };
            states.push(row);
            resolve({ data: row, error: null });
            return;
          }
          if (mode === "update" && updatePatch) {
            const matches = applyFilters(states, filters);
            if (matches.length === 0) {
              resolve({ data: null, error: null });
              return;
            }
            Object.assign(matches[0], updatePatch);
            resolve({ data: matches[0], error: null });
            return;
          }
          const matches = applyFilters(states, filters);
          resolve({ data: maybeSingle ? matches[0] ?? null : matches[0] ?? null, error: null });
        }
      };

      return builder;
    }
  };

  return { repo: new SupabaseInstagramOAuthStateRepository(supabase as never), states };
}

test("createState stores hash not plaintext state", async () => {
  const { repo, states } = buildRepository();
  const state = "opaque-state-token";
  const hash = hashInstagramOAuthState(state);
  await repo.createState({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    stateHash: hash,
    returnDestination: "CHANNEL_SETTINGS",
    requestedScopes: ["instagram_business_basic"],
    initiatedByAuthUserId: "auth-1",
    initiatedBySalesAgentId: AGENT,
    expiresAt: new Date("2026-06-20T10:10:00.000Z")
  });
  assert.equal(states[0]?.state_hash, hash);
  assert.ok(!JSON.stringify(states).includes(state));
});

test("claimStateAtCallback allows only one concurrent claim", async () => {
  const hash = hashInstagramOAuthState("shared-state");
  const { repo } = buildRepository([
    {
      id: "state-1",
      tenant_id: TENANT,
      channel_connection_id: CONNECTION,
      provider: "INSTAGRAM",
      state_hash: hash,
      return_destination: "CHANNEL_SETTINGS",
      requested_scopes: ["instagram_business_basic"],
      status: "PENDING",
      initiated_by_auth_user_id: "auth-1",
      initiated_by_sales_agent_id: AGENT,
      failure_code: null,
      claimed_at: null,
      consumed_at: null,
      expires_at: "2026-06-20T10:10:00.000Z",
      created_at: "2026-06-20T10:00:00.000Z",
      updated_at: "2026-06-20T10:00:00.000Z"
    }
  ]);

  const now = new Date("2026-06-20T10:05:00.000Z");
  const first = await repo.claimStateAtCallback({ stateHash: hash, provider: "INSTAGRAM", now });
  assert.equal(first.status, "CLAIMED");

  await assert.rejects(
    () => repo.claimStateAtCallback({ stateHash: hash, provider: "INSTAGRAM", now }),
    InstagramOAuthStateConflictError
  );
});

test("expired state rejected at claim", async () => {
  const hash = hashInstagramOAuthState("expired-state");
  const { repo } = buildRepository([
    {
      id: "state-1",
      tenant_id: TENANT,
      channel_connection_id: CONNECTION,
      provider: "INSTAGRAM",
      state_hash: hash,
      return_destination: "CHANNEL_SETTINGS",
      requested_scopes: [],
      status: "PENDING",
      initiated_by_auth_user_id: "auth-1",
      initiated_by_sales_agent_id: AGENT,
      failure_code: null,
      claimed_at: null,
      consumed_at: null,
      expires_at: "2026-06-20T10:00:00.000Z",
      created_at: "2026-06-20T09:50:00.000Z",
      updated_at: "2026-06-20T09:50:00.000Z"
    }
  ]);

  await assert.rejects(
    () =>
      repo.claimStateAtCallback({
        stateHash: hash,
        provider: "INSTAGRAM",
        now: new Date("2026-06-20T10:05:00.000Z")
      }),
    InstagramOAuthStateNotFoundError
  );
});
