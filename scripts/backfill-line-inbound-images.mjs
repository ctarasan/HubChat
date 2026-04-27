import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LINE_CHANNEL_ACCESS_TOKEN,
  BACKFILL_TENANT_ID,
  BACKFILL_LIMIT = "200",
  INBOUND_MEDIA_BUCKET = "inbound-media",
  INBOUND_MEDIA_URL_MODE = "public"
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LINE_CHANNEL_ACCESS_TOKEN || !BACKFILL_TENANT_ID) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN, BACKFILL_TENANT_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const limit = Math.max(1, Math.min(1000, Number(BACKFILL_LIMIT)));

function extractLineMessageId(metadata) {
  const id = metadata?.lineMessageId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function toUrl(path) {
  if (String(INBOUND_MEDIA_URL_MODE).toLowerCase() === "signed") {
    const signed = await supabase.storage.from(INBOUND_MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
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

  const downloadRes = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(lineMessageId)}/content`, {
    headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
  });
  if (!downloadRes.ok) return { skipped: true, reason: `LINE API ${downloadRes.status}` };

  const original = Buffer.from(await downloadRes.arrayBuffer());
  if (!original.length) return { skipped: true, reason: "empty content" };

  const originalJpeg = await sharp(original).jpeg({ quality: 82 }).toBuffer();
  const thumbJpeg = await sharp(original).resize({ width: 400, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  const originalPath = `inbound/${row.tenant_id}/line/original/${lineMessageId}.jpg`;
  const thumbPath = `inbound/${row.tenant_id}/line/thumb/${lineMessageId}.jpg`;

  const up1 = await supabase.storage.from(INBOUND_MEDIA_BUCKET).upload(originalPath, originalJpeg, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "31536000"
  });
  if (up1.error) throw up1.error;
  const up2 = await supabase.storage.from(INBOUND_MEDIA_BUCKET).upload(thumbPath, thumbJpeg, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "31536000"
  });
  if (up2.error) throw up2.error;

  const mediaUrl = await toUrl(originalPath);
  const previewUrl = await toUrl(thumbPath);
  const nextMetadata = {
    ...metadata,
    source: "line",
    lineMessageId,
    mediaUrl,
    previewUrl,
    backfilledAt: new Date().toISOString()
  };

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
  .select("id,tenant_id,message_type,media_url,preview_url,metadata_json")
  .eq("tenant_id", BACKFILL_TENANT_ID)
  .eq("message_type", "IMAGE")
  .eq("metadata_json->>source", "line")
  .is("media_url", null)
  .is("preview_url", null)
  .limit(limit);
if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

let updated = 0;
let skipped = 0;
for (const row of rows ?? []) {
  try {
    const result = await processOne(row);
    if (result.updated) updated += 1;
    else skipped += 1;
  } catch (e) {
    skipped += 1;
    console.warn("Skip row due to error:", row.id, String(e));
  }
}

console.log(JSON.stringify({ scanned: (rows ?? []).length, updated, skipped }, null, 2));

