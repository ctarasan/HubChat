import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import pino from "pino";
import { createServiceSupabaseClient } from "../../../../src/infrastructure/supabase/client.js";
import { forbidden, ok, serverError, unauthorized, badRequest } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import {
  formatUploadTooLargeError,
  isAllowedOutboundImageMime,
  isUnsafeMediaHost,
  MEDIA_STORAGE_CACHE_CONTROL_SEC,
  MEDIA_UPLOAD_MAX_BYTES,
  resolveOutboundSignedUrlTtlSec
} from "../../../../src/lib/mediaPolicy.js";

const STORAGE_BUCKET = process.env.MESSAGE_IMAGE_BUCKET ?? "message-images";
const URL_MODE = (process.env.MESSAGE_IMAGE_URL_MODE ?? "signed").toLowerCase();
const SIGNED_URL_TTL_SEC = resolveOutboundSignedUrlTtlSec(process.env.MESSAGE_IMAGE_SIGNED_URL_TTL_SEC);
const logger = pino({ name: "messages-upload-image-api" });

function resolveImageMimeType(file: File): string {
  const fileType = String(file.type ?? "").trim().toLowerCase();
  if (fileType) return fileType;
  const fileName = String(file.name ?? "").trim().toLowerCase();
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return fileType;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
    const tenantId = auth.tenantId;
    const form = await req.formData();
    const file = form.get("file");
    const widthRaw = form.get("width");
    const heightRaw = form.get("height");
    const width = typeof widthRaw === "string" && widthRaw.trim() ? Number(widthRaw) : null;
    const height = typeof heightRaw === "string" && heightRaw.trim() ? Number(heightRaw) : null;
    if (!(file instanceof File)) return badRequest("file is required");
    const mimeType = resolveImageMimeType(file);
    if (!isAllowedOutboundImageMime(mimeType)) return badRequest("Only image/jpeg, image/png, image/webp are supported");
    if (file.size <= 0) return badRequest("file is empty");
    if (file.size > MEDIA_UPLOAD_MAX_BYTES) return badRequest(formatUploadTooLargeError("image"));
    if (width !== null && (!Number.isFinite(width) || width < 1 || width > 10000)) {
      return badRequest("width must be a positive integer <= 10000");
    }
    if (height !== null && (!Number.isFinite(height) || height < 1 || height > 10000)) {
      return badRequest("height must be a positive integer <= 10000");
    }

    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
    const objectPath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const supabase = createServiceSupabaseClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, bytes, {
      contentType: mimeType,
      upsert: false,
      cacheControl: String(MEDIA_STORAGE_CACHE_CONTROL_SEC)
    });
    if (upload.error) throw upload.error;
    let mediaUrl = "";
    if (URL_MODE === "public") {
      const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      mediaUrl = pub.data.publicUrl;
    } else {
      const { data: signed, error: signedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC);
      if (signedError) throw signedError;
      mediaUrl = signed.signedUrl;
    }
    if (!mediaUrl.startsWith("https://") || isUnsafeMediaHost(mediaUrl)) {
      throw new Error("Generated media URL is not provider-fetchable (requires external HTTPS URL)");
    }
    logger.info(
      {
        tenantId,
        bucket: STORAGE_BUCKET,
        path: objectPath,
        mediaMimeType: mimeType,
        fileSizeBytes: file.size,
        urlMode: URL_MODE,
        signedUrlTtlSec: URL_MODE === "signed" ? SIGNED_URL_TTL_SEC : null
      },
      "Uploaded outbound image and generated provider-facing URL"
    );

    return ok({
      data: {
        bucket: STORAGE_BUCKET,
        path: objectPath,
        mediaUrl,
        previewUrl: mediaUrl,
        mediaMimeType: mimeType,
        fileSize: file.size,
        fileSizeBytes: file.size,
        width,
        height
      }
    });
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
