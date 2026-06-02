import type { AnalyticsCountFilter } from "../../../lib/analyticsHeadCount.js";
import { analyticsHeadCount, type AnalyticsHeadCountClient } from "../../../lib/analyticsHeadCount.js";
import type { WorkflowChannel, WorkflowFollowUpCounts, WorkflowFollowUpStatus } from "../../../domain/workflow.js";
import { WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES } from "../../../domain/workflow.js";
import type { WorkflowListRow } from "../../../domain/workflow.js";
import {
  applyInboxFilterQuerySteps,
  buildInboxFilterQuerySteps,
  defaultInboxFilterClock,
  type ConversationListInboxFilters,
  type UtcInboxFilterClock
} from "../../../interfaces/api/conversationListInboxFilters.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

/** Lean list projection: display names + follow-up mapping only (no media, notes, or message bodies). */
export const WORKFLOW_LIST_SELECT =
  "id,lead_id,channel_type,status,follow_up_at,assigned_agent_id," +
  "last_customer_message_at,created_at,updated_at,participant_display_name," +
  "participant_profile_image_url,provider_external_user_id," +
  "leads(status,external_user_id)," +
  "contacts(display_name,profile_image_url,contact_identities(profile_image_url,channel_type,external_user_id,profile_image_cached_path,profile_image_cache_status))," +
  "sales_agents(name)";

type TenantFilter = { column: "tenant_id"; op: "eq"; value: string };

function tenantEq(tenantId: string): TenantFilter {
  return { column: "tenant_id", op: "eq", value: tenantId };
}

function actionableConversationFilters(): AnalyticsCountFilter[] {
  return [{ column: "status", op: "in", values: [...WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES] }];
}

function followUpScheduledFilter(): AnalyticsCountFilter {
  return { column: "follow_up_at", op: "not_is", value: null };
}

export type WorkflowRepositoryScopeFilter = {
  assignedAgentId: string | null;
};

export type WorkflowFollowUpCountInput = {
  tenantId: string;
  scopeFilter: WorkflowRepositoryScopeFilter;
  clock: UtcInboxFilterClock;
};

export type WorkflowFollowUpListInput = {
  tenantId: string;
  scopeFilter: WorkflowRepositoryScopeFilter;
  clock: UtcInboxFilterClock;
  status?: WorkflowFollowUpStatus;
  channel?: WorkflowChannel;
  limit: number;
  cursor?: string;
};

type WorkflowListCursor = { dueAt: string; id: string };

export class SupabaseWorkflowRepository {
  constructor(private readonly client: AnalyticsHeadCountClient & WorkflowListClient) {}

  private async count(table: "conversations", filters: AnalyticsCountFilter[]): Promise<number> {
    return analyticsHeadCount(this.client, table, filters);
  }

  private scopeFilters(scopeFilter: WorkflowRepositoryScopeFilter): AnalyticsCountFilter[] {
    if (!scopeFilter.assignedAgentId) return [];
    return [{ column: "assigned_agent_id", op: "eq", value: scopeFilter.assignedAgentId }];
  }

  async fetchFollowUpCounts(input: WorkflowFollowUpCountInput): Promise<WorkflowFollowUpCounts> {
    const { tenantId, scopeFilter, clock } = input;
    const t = tenantEq(tenantId);
    const base = [t, ...actionableConversationFilters(), followUpScheduledFilter(), ...this.scopeFilters(scopeFilter)];

    // `scheduled` = count/filter dimension (any non-null follow_up_at), not an item `status` value.
    const [scheduled, overdue, dueToday, upcoming] = await Promise.all([
      this.count("conversations", base),
      this.count("conversations", [
        ...base,
        { column: "follow_up_at", op: "lt", value: clock.nowIso }
      ]),
      this.count("conversations", [
        ...base,
        { column: "follow_up_at", op: "gte", value: clock.dayStartIso },
        { column: "follow_up_at", op: "lt", value: clock.dayEndIso },
        { column: "follow_up_at", op: "gte", value: clock.nowIso }
      ]),
      this.count("conversations", [
        ...base,
        { column: "follow_up_at", op: "gte", value: clock.dayEndIso }
      ])
    ]);

    return { scheduled, overdue, dueToday, upcoming };
  }

  private inboxFiltersForStatus(
    status: WorkflowFollowUpStatus | undefined,
    clock: UtcInboxFilterClock
  ): ConversationListInboxFilters | undefined {
    if (!status || status === "scheduled") return { followUp: "scheduled" };
    if (status === "overdue") return { followUp: "overdue" };
    if (status === "due_today") return { followUp: "today" };
    if (status === "upcoming") {
      return undefined;
    }
    return undefined;
  }

  async listFollowUpItems(
    input: WorkflowFollowUpListInput
  ): Promise<{ rows: WorkflowListRow[]; nextCursor: string | null }> {
    const safeLimit = Math.max(1, Math.min(50, input.limit));
    const cursor = decodeRepoCursor<WorkflowListCursor>(input.cursor);
    const clock = input.clock;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST fluent builder
    let q: any = this.client
      .from("conversations")
      .select(WORKFLOW_LIST_SELECT)
      .eq("tenant_id", input.tenantId)
      .in("status", [...WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES])
      .not("follow_up_at", "is", null)
      .order("follow_up_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(safeLimit + 1);

    if (input.scopeFilter.assignedAgentId) {
      q = q.eq("assigned_agent_id", input.scopeFilter.assignedAgentId);
    }
    if (input.channel) {
      q = q.eq("channel_type", input.channel);
    }

    if (input.status === "upcoming") {
      q = q.gte("follow_up_at", clock.dayEndIso);
    } else {
      const inboxFilters = this.inboxFiltersForStatus(input.status, clock);
      const steps = buildInboxFilterQuerySteps(inboxFilters, clock);
      if (steps.length > 0) {
        q = applyInboxFilterQuerySteps(q, steps);
      }
    }

    if (cursor?.dueAt && cursor?.id) {
      q = q.or(
        `follow_up_at.gt."${cursor.dueAt}",and(follow_up_at.eq."${cursor.dueAt}",id.gt."${cursor.id}")`
      );
    }

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as WorkflowListRow[];
    const page = rows.slice(0, safeLimit);
    const tail = page[page.length - 1] ?? null;
    const nextCursor =
      rows.length > safeLimit && tail?.follow_up_at && tail?.id
        ? encodeRepoCursor({ dueAt: String(tail.follow_up_at), id: String(tail.id) })
        : null;
    return { rows: page, nextCursor };
  }
}

export type WorkflowListClient = {
  from(table: "conversations"): {
    select(columns: string): WorkflowListQueryBuilder & WorkflowListQueryPromise;
  };
};

export type WorkflowListQueryPromise = Promise<{
  data: WorkflowListRow[] | null;
  error: { message: string } | null;
}>;

export type WorkflowListQueryBuilder = {
  eq(column: string, value: string): WorkflowListQueryBuilder;
  in(column: string, values: string[]): WorkflowListQueryBuilder;
  not(column: string, operator: string, value: unknown): WorkflowListQueryBuilder;
  gte(column: string, value: string): WorkflowListQueryBuilder;
  order(column: string, opts: { ascending: boolean }): WorkflowListQueryBuilder;
  limit(n: number): WorkflowListQueryBuilder;
  or(expression: string): WorkflowListQueryBuilder;
};

export function createSupabaseWorkflowRepository(
  client: AnalyticsHeadCountClient & WorkflowListClient
): SupabaseWorkflowRepository {
  return new SupabaseWorkflowRepository(client);
}

export function workflowInboxClock(now: Date = new Date()): UtcInboxFilterClock {
  return defaultInboxFilterClock(now);
}
