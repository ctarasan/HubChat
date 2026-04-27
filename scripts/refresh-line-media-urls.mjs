import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REFRESH_TENANT_ID,
  REFRESH_LIMIT = "500",
  REFRESH_FORCE_ALL = "false",
  INBOUND_MEDIA_BUCKET = "inbound-media",
  INBOUND_MEDIA_URL_MODE = "signed",
  INBOUND_MEDIA_SIGNED_URL_TTL_SEC = "604800"
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REFRESH_TENANT_ID) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REFRESH_TENANT_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const limit = Math.max(1, Math.min(5000, Number(REFRESH_LIMIT) || 500));
const forceAll = String(REFRESH_FORCE_ALL).toLowerCase() === "true";
const urlMode = String(INBOUND_MEDIA_URL_MODE).toLowerCase() === "public" ? "public" : "signed";
const signedTtlSec = Math.max(3600, Number(INBOUND_MEDIA_SIGNED_URL_TTL_SEC) || 604800);

function extractLineMessageId(metadata) {
  const id = metadata?.lineMessageId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function extractPath(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSignedUrl(url) {
  return typeof url === "string" && url.includes("/storage/v1/object/sign/");
}

function isPublicUrl(url) {
  return typeof url === "string" && url.includes("/storage/v1/object/public/");
}

function shouldRefresh(row, metadata) {
  if (forceAll) return true;

  const mediaUrl = row.media_url;
  const previewUrl = row.preview_url;
  const metadataMode = typeof metadata?.urlMode === "string" ? metadata.urlMode : null;
  if (!mediaUrl || !previewUrl) return true;
  if (metadataMode !== urlMode) return true;

  if (urlMode === "signed" && (!isSignedUrl(mediaUrl) || !isSignedUrl(previewUrl))) return true;
  if (urlMode === "public" && (!isPublicUrl(mediaUrl) || !isPublicUrl(previewUrl))) return true;

  return false;
}

async function toStorageUrl(path) {
  if (urlMode === "signed") {
    const signed = await supabase.storage.from(INBOUND_MEDIA_BUCKET).createSignedUrl(path, signedTtlSec);
    if (signed.error) throw signed.error;
    return signed.data.signedUrl;
  }
  const pub = supabase.storage.from(INBOUND_MEDIA_BUCKET).getPublicUrl(path);
  return pub.data.publicUrl;
}

async function processOne(row) {
  const metadata = row.metadata_json ?? {};
  const lineMessageId = extractLineMessageId(metadata);
  if (!lineMessageId) return { skipped: true, reason: "missing lineMessageId" };
  if (!shouldRefresh(row, metadata)) return { skipped: true, reason: "already matching mode" };

  const originalPath =
    extractPath(metadata, "originalPath") ?? `inbound/${row.tenant_id}/line/original/${lineMessageId}.jpg`;
  const thumbPath = extractPath(metadata, "thumbPath") ?? `inbound/${row.tenant_id}/line/thumb/${lineMessageId}.jpg`;

  const mediaUrl = await toStorageUrl(originalPath);
  const previewUrl = await toStorageUrl(thumbPath);

  const nextMetadata = {
    ...metadata,
    source: "line",
    lineMessageId,
    storageBucket: INBOUND_MEDIA_BUCKET,
    originalPath,
    thumbPath,
    mediaUrl,
    previewUrl,
    urlMode,
    refreshedAt: new Date().toISOString(),
    ...(urlMode === "signed" ? { signedUrlExpiresInSec: signedTtlSec } : {})
  };
  if (urlMode !== "signed" && "signedUrlExpiresInSec" in nextMetadata) {
    delete nextMetadata.signedUrlExpiresInSec;
  }

  const { error: updateError } = await supabase
    .from("messages")
    .update({
      media_url: mediaUrl,
      preview_url: previewUrl,
      metadata_json: nextMetadata
    })
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id);
  if (updateError) throw updateError;

  return { updated: true };
}

const { data: rows, error } = await supabase
  .from("messages")
  .select("id,tenant_id,message_type,media_url,preview_url,metadata_json,created_at")
  .eq("tenant_id", REFRESH_TENANT_ID)
  .eq("message_type", "IMAGE")
  .or("metadata_json->>source.eq.line,metadata_json->>lineMessageId.not.is.null")
  .order("created_at", { ascending: false })
  .limit(limit);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

let updated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows ?? []) {
  try {
    const result = await processOne(row);
    if (result.updated) updated += 1;
    else skipped += 1;
  } catch (e) {
    failed += 1;
    console.warn("Failed row:", row.id, String(e));
  }
}

console.log(
  JSON.stringify(
    {
      scanned: (rows ?? []).length,
      updated,
      skipped,
      failed,
      mode: urlMode,
      forceAll,
      ttlSec: urlMode === "signed" ? signedTtlSec : null
    },
    null,
    2
  )
);
