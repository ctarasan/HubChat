import { z } from "zod";
import {
  WORKFLOW_CHANNELS,
  WORKFLOW_FOLLOW_UP_STATUSES,
  WORKFLOW_KINDS,
  WORKFLOW_SCOPES
} from "../../domain/workflow.js";

export const WORKFLOW_DEFAULT_LIMIT = 25;
export const WORKFLOW_MAX_LIMIT = 50;

export const WorkflowSummaryQuerySchema = z.object({
  scope: z.enum(WORKFLOW_SCOPES).optional()
});

export const WorkflowItemsQuerySchema = z.object({
  kind: z.enum(WORKFLOW_KINDS),
  status: z.enum(WORKFLOW_FOLLOW_UP_STATUSES).optional(),
  scope: z.enum(WORKFLOW_SCOPES).optional(),
  assignedAgentId: z.string().uuid().optional(),
  channel: z.enum(WORKFLOW_CHANNELS).optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
});

export type WorkflowSummaryQuery = z.infer<typeof WorkflowSummaryQuerySchema>;
export type WorkflowItemsQuery = z.infer<typeof WorkflowItemsQuerySchema>;

export function parseWorkflowLimit(raw?: string): number {
  if (!raw) return WORKFLOW_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return WORKFLOW_DEFAULT_LIMIT;
  return Math.min(WORKFLOW_MAX_LIMIT, Math.floor(n));
}

export type ParseWorkflowQueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function parseWorkflowSummaryQuery(
  qs: Record<string, string | undefined>
): ParseWorkflowQueryResult<WorkflowSummaryQuery> {
  const parsed = WorkflowSummaryQuerySchema.safeParse({
    scope: qs.scope?.trim() || undefined
  });
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  return { ok: true, value: parsed.data };
}

export type WorkflowItemsQueryParsed = Omit<WorkflowItemsQuery, "limit"> & { limit: number };

export function parseWorkflowItemsQuery(
  qs: Record<string, string | undefined>
): ParseWorkflowQueryResult<WorkflowItemsQueryParsed> {
  const parsed = WorkflowItemsQuerySchema.safeParse({
    kind: qs.kind?.trim(),
    status: qs.status?.trim() || undefined,
    scope: qs.scope?.trim() || undefined,
    assignedAgentId: qs.assignedAgentId?.trim() || undefined,
    channel: qs.channel?.trim() || undefined,
    cursor: qs.cursor?.trim() || undefined,
    limit: qs.limit?.trim() || undefined
  });
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  const { limit: _limit, ...rest } = parsed.data;
  return {
    ok: true,
    value: { ...rest, limit: parseWorkflowLimit(parsed.data.limit) }
  };
}
