import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";

const authEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1)
});

export type AppRole = "SALES" | "MANAGER" | "ADMIN";

export interface AuthContext {
  tenantId: string;
  userId: string;
  email: string;
  role: AppRole;
}

function getBearerToken(req: NextRequest): string {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  return auth.slice("Bearer ".length).trim();
}

export async function requireAuth(req: NextRequest, allowedRoles: AppRole[]): Promise<AuthContext> {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) throw new Error("Missing x-tenant-id header");

  const token = getBearerToken(req);
  const env = authEnvSchema.parse(process.env);
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  if (!data.user.email) throw new Error("Authenticated user has no email");

  const serviceClient = createServiceSupabaseClient();
  const { data: agent, error: agentError } = await serviceClient
    .from("sales_agents")
    .select("id, role, status")
    .eq("tenant_id", tenantId)
    .eq("email", data.user.email)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (agentError) throw agentError;

  const roleFromDb = (agent?.role ?? data.user.app_metadata?.role ?? data.user.user_metadata?.role) as AppRole | undefined;
  if (!roleFromDb) throw new Error("User role not configured");
  if (!allowedRoles.includes(roleFromDb)) throw new Error("Forbidden");

  return {
    tenantId,
    userId: data.user.id,
    email: data.user.email,
    role: roleFromDb
  };
}
