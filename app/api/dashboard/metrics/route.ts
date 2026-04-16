import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { supabase } = apiBootstrap();

    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [leadsRes, agentsRes, convRes, inboundMessagesRes, outboundMessagesRes, channelBreakdownRes, activeContactsRes] =
      await Promise.all([
      supabase.from("leads").select("id,status,assigned_sales_id,created_at,last_contact_at").eq("tenant_id", tenantId),
      supabase.from("sales_agents").select("id,name").eq("tenant_id", tenantId).eq("status", "ACTIVE"),
      supabase.from("conversations").select("id,assigned_agent_id,status").eq("tenant_id", tenantId),
      supabase
        .from("messages")
        .select("id,channel_type,created_at", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("direction", "INBOUND")
        .gte("created_at", windowStart),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("direction", "OUTBOUND")
        .gte("created_at", windowStart),
      supabase
        .from("messages")
        .select("channel_type, direction")
        .eq("tenant_id", tenantId)
        .eq("direction", "INBOUND")
        .gte("created_at", windowStart),
      supabase
        .from("contact_identities")
        .select("external_user_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
    ]);

    if (leadsRes.error) throw leadsRes.error;
    if (agentsRes.error) throw agentsRes.error;
    if (convRes.error) throw convRes.error;
    if (inboundMessagesRes.error) throw inboundMessagesRes.error;
    if (outboundMessagesRes.error) throw outboundMessagesRes.error;
    if (channelBreakdownRes.error) throw channelBreakdownRes.error;
    if (activeContactsRes.error) throw activeContactsRes.error;

    const leads = leadsRes.data ?? [];
    const agents = agentsRes.data ?? [];
    const conversations = convRes.data ?? [];
    const channelInboundRows = channelBreakdownRes.data ?? [];

    const byStatus = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});

    const leadsPerSales = agents.map((a) => {
      const assigned = leads.filter((l) => l.assigned_sales_id === a.id);
      const contacted = assigned.filter((l) =>
        ["CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON"].includes(l.status)
      ).length;
      const won = assigned.filter((l) => l.status === "WON").length;
      const convCount = conversations.filter((c) => c.assigned_agent_id === a.id && c.status !== "CLOSED").length;
      return {
        salesAgentId: a.id,
        salesAgentName: a.name,
        assignedLeads: assigned.length,
        contactedLeads: contacted,
        conversionRate: assigned.length > 0 ? won / assigned.length : 0,
        activeConversations: convCount
      };
    });

    const funnel = ["NEW", "ASSIGNED", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"].map((status) => ({
      status,
      count: byStatus[status] ?? 0
    }));

    const inboundByChannel = channelInboundRows.reduce<Record<string, number>>((acc, row) => {
      const key = row.channel_type ?? "UNKNOWN";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return ok({
      data: {
        periodDays: 30,
        leadsByStatus: byStatus,
        leadsPerSales,
        conversionFunnel: funnel,
        omniSummary: {
          inboundMessages30d: inboundMessagesRes.count ?? 0,
          outboundMessages30d: outboundMessagesRes.count ?? 0,
          activeContacts: activeContactsRes.count ?? 0,
          openConversations: conversations.filter((c) => c.status !== "CLOSED").length
        },
        inboundByChannel30d: inboundByChannel
      }
    });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
