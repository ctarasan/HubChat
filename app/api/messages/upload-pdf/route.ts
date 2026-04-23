import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import pino from "pino";
import { createServiceSupabaseClient } from "../../../../src/infrastructure/supabase/client.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

const STORAGE_BUCKET = process.env.MESSAGE_FILE_BUCKET ?? process.env.MESSAGE_IMAGE_BUCKET ?? "message-images";
const URL_MODE = (process.env.MESSAGE_FILE_URL_MODE ?? process.env.MESSAGE_IMAGE_URL_MODE ?? "signed").toLowerCase();
const SIGNED_URL_TTL_SEC = Number(
  process.env.MESSAGE_FILE_SIGNED_URL_TTL_SEC ?? process.env.MESSAGE_IMAGE_SIGNED_URL_TTL_SEC ?? `${60 * 60 * 24 * 30}`
);
const logger = pino({ name: "messages-upload-pdf-api" });

function isUnsafeHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|.+\.local$)/i.test(host);
  } catch {
    return true;
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("file is required");
    if (file.type !== "application/pdf") return badRequest("Only application/pdf is supported");
    if (file.size <= 0) return badRequest("file is empty");
    if (file.size > 10 * 1024 * 1024) return badRequest("file is too large (max 10MB)");

    const objectPath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.pdf`;
    const supabase = createServiceSupabaseClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000"
    });
    if (upload.error) throw upload.error;

    let fileUrl = "";
    if (URL_MODE === "public") {
      const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      fileUrl = pub.data.publicUrl;
    } else {
      const { data: signed, error: signedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, Math.max(3600, SIGNED_URL_TTL_SEC));
      if (signedError) throw signedError;
      fileUrl = signed.signedUrl;
    }

    if (!fileUrl.startsWith("https://") || isUnsafeHost(fileUrl)) {
      throw new Error("Generated file URL is not provider-fetchable (requires external HTTPS URL)");
    }

    logger.info(
      {
        tenantId,
        bucket: STORAGE_BUCKET,
        path: objectPath,
        fileName: file.name,
        fileSizeBytes: file.size,
        urlMode: URL_MODE
      },
      "Uploaded outbound pdf and generated provider-facing URL"
    );

    return ok({
      data: {
        bucket: STORAGE_BUCKET,
        path: objectPath,
        fileUrl,
        mediaUrl: fileUrl,
        mediaMimeType: "application/pdf",
        fileName: file.name,
        fileSizeBytes: file.size
      }
    });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
