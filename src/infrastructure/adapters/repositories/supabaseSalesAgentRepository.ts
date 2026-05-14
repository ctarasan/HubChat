import type { SupabaseClient } from "@supabase/supabase-js";
import { emailForExactIlike, normalizeEmailForStorage } from "../../supabase/emailIlike.js";
import type {
  CreateSalesAgentInput,
  PatchSalesAgentInput,
  SalesAgentListByTenantInput,
  SalesAgentListItem,
  SalesAgentRepository,
  SalesAssignmentMode,
  TeamMemberRow
} from "../../../domain/ports.js";

const ACTIVE_CONVERSATION_STATUSES = ["OPEN", "PENDING"] as const;
const EXCLUDED_LEAD_STATUSES = new Set(["WON", "LOST", "UNQUALIFIED"]);

function mapAssignmentMode(v: unknown): SalesAssignmentMode {
  const s = String(v ?? "MANUAL_ONLY");
  if (s === "AUTO" || s === "MANUAL_ONLY" || s === "PAUSED") return s;
  return "MANUAL_ONLY";
}

function baseRowToTeamMember(
  row: Record<string, unknown>,
  activeConversationCount: number,
  activeLeadCount: number
): TeamMemberRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    role: String(row.role),
    status: String(row.status),
    assignmentEnabled: Boolean(row.assignment_enabled),
    assignmentMode: mapAssignmentMode(row.assignment_mode),
    maxActiveConversations: row.max_active_conversations == null ? null : Number(row.max_active_conversations),
    maxActiveLeads: row.max_active_leads == null ? null : Number(row.max_active_leads),
    activeConversationCount,
    activeLeadCount,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

async function computeWorkloadMaps(
  supabase: SupabaseClient,
  tenantId: string,
  agentIds: string[]
): Promise<{ conv: Map<string, number>; leads: Map<string, number> }> {
  const conv = new Map<string, number>();
  const leads = new Map<string, number>();
  if (agentIds.length === 0) return { conv, leads };

  const { data: convRows, error: convErr } = await supabase
    .from("conversations")
    .select("assigned_agent_id")
    .eq("tenant_id", tenantId)
    .in("assigned_agent_id", agentIds)
    .in("status", [...ACTIVE_CONVERSATION_STATUSES]);
  if (convErr) throw convErr;
  for (const r of convRows ?? []) {
    const aid = r.assigned_agent_id as string | null;
    if (!aid) continue;
    conv.set(aid, (conv.get(aid) ?? 0) + 1);
  }

  const { data: leadRows, error: leadErr } = await supabase
    .from("leads")
    .select("assigned_sales_id,status")
    .eq("tenant_id", tenantId)
    .in("assigned_sales_id", agentIds);
  if (leadErr) throw leadErr;
  for (const r of leadRows ?? []) {
    const sid = r.assigned_sales_id as string | null;
    const st = String(r.status ?? "");
    if (!sid || EXCLUDED_LEAD_STATUSES.has(st)) continue;
    leads.set(sid, (leads.get(sid) ?? 0) + 1);
  }

  return { conv, leads };
}

export class SupabaseSalesAgentRepository implements SalesAgentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listActiveByTenant(tenantId: string): Promise<SalesAgentListItem[]> {
    const rows = await this.listByTenant({ tenantId, includeInactive: false });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status
    }));
  }

  async listByTenant(input: SalesAgentListByTenantInput): Promise<TeamMemberRow[]> {
    let q = this.supabase
      .from("sales_agents")
      .select(
        "id,tenant_id,name,email,role,status,assignment_enabled,assignment_mode,max_active_conversations,max_active_leads,created_at,updated_at"
      )
      .eq("tenant_id", input.tenantId)
      .order("name", { ascending: true })
      .order("email", { ascending: true });

    if (!input.includeInactive) {
      q = q.eq("status", "ACTIVE");
    }
    if (input.role) {
      q = q.eq("role", input.role);
    }
    if (input.status) {
      q = q.eq("status", input.status);
    }
    if (input.assignmentMode) {
      q = q.eq("assignment_mode", input.assignmentMode);
    }
    const search = typeof input.search === "string" ? input.search.trim() : "";
    if (search.length > 0) {
      const esc = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      q = q.or(`name.ilike.%${esc}%,email.ilike.%${esc}%`);
    }

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id));
    const { conv, leads } = await computeWorkloadMaps(this.supabase, input.tenantId, ids);
    return rows.map((row) => {
      const id = String(row.id);
      return baseRowToTeamMember(row, conv.get(id) ?? 0, leads.get(id) ?? 0);
    });
  }

  async findByIdInTenant(tenantId: string, salesAgentId: string): Promise<TeamMemberRow | null> {
    const { data, error } = await this.supabase
      .from("sales_agents")
      .select(
        "id,tenant_id,name,email,role,status,assignment_enabled,assignment_mode,max_active_conversations,max_active_leads,created_at,updated_at"
      )
      .eq("tenant_id", tenantId)
      .eq("id", salesAgentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const { conv, leads } = await computeWorkloadMaps(this.supabase, tenantId, [String(row.id)]);
    const id = String(row.id);
    return baseRowToTeamMember(row, conv.get(id) ?? 0, leads.get(id) ?? 0);
  }

  async findByEmailInTenant(tenantId: string, email: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from("sales_agents")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", emailForExactIlike(normalizeEmailForStorage(email)))
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return null;
    return { id: String(data.id) };
  }

  async create(input: CreateSalesAgentInput): Promise<TeamMemberRow> {
    const row = {
      tenant_id: input.tenantId,
      name: input.name.trim(),
      email: normalizeEmailForStorage(input.email),
      role: input.role,
      status: input.status ?? "ACTIVE",
      assignment_enabled: input.assignmentEnabled ?? false,
      assignment_mode: input.assignmentMode ?? "MANUAL_ONLY",
      max_active_conversations: input.maxActiveConversations ?? null,
      max_active_leads: input.maxActiveLeads ?? null
    };
    const { data, error } = await this.supabase.from("sales_agents").insert(row).select("*").single();
    if (error) throw error;
    const r = data as Record<string, unknown>;
    return baseRowToTeamMember(r, 0, 0);
  }

  async update(input: PatchSalesAgentInput): Promise<TeamMemberRow> {
    const p: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const patch = input.patch;
    if (patch.name !== undefined) p.name = patch.name.trim();
    if (patch.email !== undefined) p.email = normalizeEmailForStorage(patch.email);
    if (patch.role !== undefined) p.role = patch.role;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.assignmentEnabled !== undefined) p.assignment_enabled = patch.assignmentEnabled;
    if (patch.assignmentMode !== undefined) p.assignment_mode = patch.assignmentMode;
    if (patch.maxActiveConversations !== undefined) p.max_active_conversations = patch.maxActiveConversations;
    if (patch.maxActiveLeads !== undefined) p.max_active_leads = patch.maxActiveLeads;

    const { data, error } = await this.supabase
      .from("sales_agents")
      .update(p)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.salesAgentId)
      .select("*")
      .single();
    if (error) throw error;
    const r = data as Record<string, unknown>;
    const id = String(r.id);
    const { conv, leads } = await computeWorkloadMaps(this.supabase, input.tenantId, [id]);
    return baseRowToTeamMember(r, conv.get(id) ?? 0, leads.get(id) ?? 0);
  }

  async countActiveAdmins(tenantId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("sales_agents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "ADMIN")
      .eq("status", "ACTIVE");
    if (error) throw error;
    return count ?? 0;
  }

  async findActiveByIdInTenant(tenantId: string, salesAgentId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("sales_agents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", salesAgentId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }
}
