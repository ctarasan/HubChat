import type { ChannelConnectionRecord } from "../domain/channelConnections.js";

/** Statuses that may receive Messenger webhooks for a linked Page. */
export const FACEBOOK_WEBHOOK_ROUTE_CONNECTION_STATUSES = [
  "AUTHORIZING",
  "READY",
  "OUTBOUND_VERIFIED",
  "INBOUND_VERIFIED",
  "WEBHOOK_VERIFIED"
] as const;

export type FacebookWebhookTenantResolveInput = {
  entryPageIds: string[];
  connectionsByPageId: ChannelConnectionRecord[];
  fallbackTenantId: string | null | undefined;
  headerTenantId?: string | null;
};

export type FacebookWebhookTenantResolveResult = {
  tenantId: string | null;
  source: "header" | "page_connection" | "default_tenant" | "missing";
  matchedPageId: string | null;
  ambiguous: boolean;
};

/** Collect Page IDs from Meta page webhook entry[].id values. */
export function extractFacebookWebhookEntryPageIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];
  const ids: string[] = [];
  for (const row of entry) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  }
  return [...new Set(ids)];
}

/**
 * Resolve webhook tenant for Facebook Page events.
 * Prefer unique READY/AUTHORIZING channel_connections match by provider_page_id;
 * do not change DEFAULT_TENANT_ID (SmartKorp) when no page match exists.
 */
export function resolveFacebookWebhookTenantId(
  input: FacebookWebhookTenantResolveInput
): FacebookWebhookTenantResolveResult {
  const header = input.headerTenantId?.trim() || null;
  if (header) {
    return { tenantId: header, source: "header", matchedPageId: null, ambiguous: false };
  }

  const active = input.connectionsByPageId.filter((c) =>
    (FACEBOOK_WEBHOOK_ROUTE_CONNECTION_STATUSES as readonly string[]).includes(c.status)
  );

  const tenants = [...new Set(active.map((c) => c.tenantId))];
  if (tenants.length === 1) {
    const match = active[0]!;
    return {
      tenantId: match.tenantId,
      source: "page_connection",
      matchedPageId: match.providerPageId ?? input.entryPageIds[0] ?? null,
      ambiguous: false
    };
  }
  if (tenants.length > 1) {
    return {
      tenantId: input.fallbackTenantId?.trim() || null,
      source: input.fallbackTenantId?.trim() ? "default_tenant" : "missing",
      matchedPageId: input.entryPageIds[0] ?? null,
      ambiguous: true
    };
  }

  const fallback = input.fallbackTenantId?.trim() || null;
  if (fallback) {
    return {
      tenantId: fallback,
      source: "default_tenant",
      matchedPageId: input.entryPageIds[0] ?? null,
      ambiguous: false
    };
  }
  return { tenantId: null, source: "missing", matchedPageId: null, ambiguous: false };
}
