import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import pino from "pino";
import { createServiceSupabaseClient } from "../../../../src/infrastructure/supabase/client.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import {
  formatUploadTooLargeError,
  isUnsafeMediaHost,
  MEDIA_STORAGE_CACHE_CONTROL_SEC,
  MEDIA_UPLOAD_MAX_BYTES,
  OUTBOUND_PDF_MIME,
  resolveOutboundSignedUrlTtlSec
} from "../../../../src/lib/mediaPolicy.js";

const STORAGE_BUCKET = process.env.MESSAGE_FILE_BUCKET ?? process.env.MESSAGE_IMAGE_BUCKET ?? "message-images";
const URL_MODE = (process.env.MESSAGE_FILE_URL_MODE ?? process.env.MESSAGE_IMAGE_URL_MODE ?? "signed").toLowerCase();
const SIGNED_URL_TTL_SEC = resolveOutboundSignedUrlTtlSec(
  process.env.MESSAGE_FILE_SIGNED_URL_TTL_SEC ?? process.env.MESSAGE_IMAGE_SIGNED_URL_TTL_SEC
);
const logger = pino({ name: "messages-upload-pdf-api" });

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("file is required");
    if (file.type !== OUTBOUND_PDF_MIME) return badRequest("Only application/pdf is supported");
    if (file.size <= 0) return badRequest("file is empty");
    if (file.size > MEDIA_UPLOAD_MAX_BYTES) return badRequest(formatUploadTooLargeError("pdf"));

    const objectPath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.pdf`;
    const supabase = createServiceSupabaseClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: String(MEDIA_STORAGE_CACHE_CONTROL_SEC)
    });
    if (upload.error) throw upload.error;

    let fileUrl = "";
    if (URL_MODE === "public") {
      const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      fileUrl = pub.data.publicUrl;
    } else {
      const { data: signed, error: signedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC);
      if (signedError) throw signedError;
      fileUrl = signed.signedUrl;
    }

    if (!fileUrl.startsWith("https://") || isUnsafeMediaHost(fileUrl)) {
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
