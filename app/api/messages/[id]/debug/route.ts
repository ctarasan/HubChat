import { NextRequest } from "next/server";
import { createServiceSupabaseClient } from "../../../../../src/infrastructure/supabase/client.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ["MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const { id } = await params;
    if (!id || !id.trim()) return badRequest("message id is required");

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("messages")
      .select("id,tenant_id,conversation_id,message_type,media_url,preview_url,metadata_json,created_at")
      .eq("tenant_id", tenantId)
      .eq("id", id.trim())
      .maybeSingle();
    if (error) throw error;
    if (!data) return badRequest("message not found");

    return ok({ data });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}

