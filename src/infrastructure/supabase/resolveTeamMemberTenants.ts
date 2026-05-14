/**
 * Server-only: resolve tenant membership from sales_agents for login.
 */

import { createServiceSupabaseClient } from "./client.js";
import { emailForExactIlike, normalizeEmailForStorage } from "./emailIlike.js";

/** Distinct tenant_id values with an ACTIVE sales_agents row for this email. */
export async function listActiveTenantIdsForEmail(email: string): Promise<string[]> {
  const client = createServiceSupabaseClient();
  const pattern = emailForExactIlike(normalizeEmailForStorage(email));
  const { data, error } = await client
    .from("sales_agents")
    .select("tenant_id")
    .ilike("email", pattern)
    .eq("status", "ACTIVE");
  if (error) throw error;
  const rows = (data ?? []) as { tenant_id?: string }[];
  const ids = [...new Set(rows.map((r) => r.tenant_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  return ids;
}
