import { NextRequest } from "next/server";

export function getTenantIdOrThrow(req: NextRequest): string {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    throw new Error("Missing x-tenant-id header");
  }
  return tenantId;
}
