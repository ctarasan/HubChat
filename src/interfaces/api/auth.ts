import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";
import { emailForExactIlike, normalizeEmailForStorage } from "../../infrastructure/supabase/emailIlike.js";

const authEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1)
});

export type AppRole = "SALES" | "MANAGER" | "ADMIN";

const APP_ROLES: AppRole[] = ["SALES", "MANAGER", "ADMIN"];

export interface AuthContext {
  tenantId: string;
  userId: string;
  email: string;
  role: AppRole;
  /** Matched `sales_agents.id` for the authenticated email in this tenant, when an ACTIVE row exists. */
  salesAgentId: string | null;
}

export type SalesAgentAuthRow = {
  id: string;
  role: string;
  status: string;
};

export type RequireAuthDeps = {
  getAuthUser: (token: string) => Promise<{ id: string; email: string }>;
  lookupSalesAgent: (tenantId: string, email: string) => Promise<SalesAgentAuthRow | null>;
};

function getBearerToken(req: NextRequest): string {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  return auth.slice("Bearer ".length).trim();
}

/** Resolve role from DB row only; never from JWT metadata. */
export function resolveAuthFromSalesAgentRow(
  agent: SalesAgentAuthRow | null,
  allowedRoles: AppRole[]
): Pick<AuthContext, "role" | "salesAgentId"> {
  if (!agent) {
    throw new Error("Forbidden: no active sales agent profile");
  }
  if (agent.status !== "ACTIVE") {
    throw new Error("Forbidden: inactive profile");
  }
  const role = agent.role as AppRole;
  if (!APP_ROLES.includes(role)) {
    throw new Error("Forbidden");
  }
  if (!allowedRoles.includes(role)) {
    throw new Error("Forbidden");
  }
  return { role, salesAgentId: agent.id };
}

export function createRequireAuth(deps: RequireAuthDeps) {
  return async function requireAuth(req: NextRequest, allowedRoles: AppRole[]): Promise<AuthContext> {
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) throw new Error("Missing x-tenant-id header");

    const token = getBearerToken(req);
    const user = await deps.getAuthUser(token);

    let agent: SalesAgentAuthRow | null;
    try {
      agent = await deps.lookupSalesAgent(tenantId, user.email);
    } catch {
      throw new Error("SalesAgentLookupFailed");
    }

    const { role, salesAgentId } = resolveAuthFromSalesAgentRow(agent, allowedRoles);

    return {
      tenantId,
      userId: user.id,
      email: user.email,
      role,
      salesAgentId
    };
  };
}

async function defaultGetAuthUser(token: string): Promise<{ id: string; email: string }> {
  const env = authEnvSchema.parse(process.env);
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  if (!data.user.email) throw new Error("Authenticated user has no email");
  return { id: data.user.id, email: normalizeEmailForStorage(data.user.email) };
}

async function defaultLookupSalesAgent(tenantId: string, email: string): Promise<SalesAgentAuthRow | null> {
  const serviceClient = createServiceSupabaseClient();
  const { data: agent, error: agentError } = await serviceClient
    .from("sales_agents")
    .select("id, role, status")
    .eq("tenant_id", tenantId)
    .ilike("email", emailForExactIlike(email))
    .maybeSingle();
  if (agentError) throw new Error("SalesAgentLookupFailed");
  if (!agent?.id) return null;
  return {
    id: String(agent.id),
    role: String(agent.role ?? ""),
    status: String(agent.status ?? "")
  };
}

export const requireAuth = createRequireAuth({
  getAuthUser: defaultGetAuthUser,
  lookupSalesAgent: defaultLookupSalesAgent
});
