import sharp from "sharp";
import pino from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";

const logger = pino({ name: "inbound-media-service" });

function toPositiveInt(raw: string | undefined, fallbackValue: number): number {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallbackValue;
  return Math.floor(n);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export class InboundMediaService {
  private readonly bucket: string;
  private readonly urlMode: "public" | "signed";
  private readonly maxSizeBytes: number;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly deps: {
      lineChannelAccessToken?: string;
      signedUrlTtlSec?: number;
    }
  ) {
    this.bucket = process.env.INBOUND_MEDIA_BUCKET ?? "inbound-media";
    this.urlMode = (process.env.INBOUND_MEDIA_URL_MODE ?? "public").toLowerCase() === "signed" ? "signed" : "public";
    this.maxSizeBytes = toPositiveInt(process.env.INBOUND_MEDIA_MAX_SIZE_MB, 10) * 1024 * 1024;
  }

  private async toStorageUrl(path: string): Promise<string> {
    if (this.urlMode === "public") {
      const pub = this.supabase.storage.from(this.bucket).getPublicUrl(path);
      return pub.data.publicUrl;
    }
    const ttlSec = Math.max(3600, this.deps.signedUrlTtlSec ?? 60 * 60 * 24 * 7);
    const signed = await this.supabase.storage.from(this.bucket).createSignedUrl(path, ttlSec);
    if (signed.error) throw signed.error;
    return signed.data.signedUrl;
  }

  async processLineInboundImage(input: {
    tenantId: string;
    lineMessageId: string;
  }): Promise<
    | { ok: true; mediaUrl: string; previewUrl: string; byteSize?: number }
    | { ok: false; reason: string }
  > {
    const token = this.deps.lineChannelAccessToken;
    if (!token) return { ok: false, reason: "LINE access token missing" };
    const contentUrl = `https://api-data.line.me/v2/bot/message/${encodeURIComponent(input.lineMessageId)}/content`;
    let originalBytes: Buffer;
    let downloadSuccess = false;
    try {
      const res = await fetch(contentUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        logger.warn(
          {
            tenantId: input.tenantId,
            lineMessageId: input.lineMessageId,
            downloadAttempted: true,
            downloadSuccess: false,
            status: res.status
          },
          "LINE inbound image download failed"
        );
        return { ok: false, reason: `LINE content API failed (${res.status})` };
      }
      const arr = await res.arrayBuffer();
      originalBytes = Buffer.from(arr);
      downloadSuccess = true;
    } catch (error) {
      logger.warn(
        {
          tenantId: input.tenantId,
          lineMessageId: input.lineMessageId,
          downloadAttempted: true,
          downloadSuccess: false,
          error: String(error)
        },
        "LINE inbound image download threw"
      );
      return { ok: false, reason: "LINE content download error" };
    }

    if (!originalBytes || originalBytes.length === 0) return { ok: false, reason: "LINE image content empty" };
    if (originalBytes.length > this.maxSizeBytes) return { ok: false, reason: "LINE image exceeds max size" };

    const originalPath = `inbound/${input.tenantId}/line/original/${input.lineMessageId}.jpg`;
    const thumbPath = `inbound/${input.tenantId}/line/thumb/${input.lineMessageId}.jpg`;
    try {
      const originalJpeg = await sharp(originalBytes).jpeg({ quality: 82 }).toBuffer();
      const thumbnailJpeg = await sharp(originalBytes)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();

      const uploadedOriginal = await this.supabase.storage.from(this.bucket).upload(originalPath, originalJpeg, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000"
      });
      if (uploadedOriginal.error) throw uploadedOriginal.error;

      const uploadedThumb = await this.supabase.storage.from(this.bucket).upload(thumbPath, thumbnailJpeg, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000"
      });
      if (uploadedThumb.error) throw uploadedThumb.error;

      const mediaUrl = await this.toStorageUrl(originalPath);
      const previewUrl = await this.toStorageUrl(thumbPath);
      if (!isHttpsUrl(mediaUrl) || !isHttpsUrl(previewUrl)) {
        throw new Error("Generated inbound media URL is not HTTPS");
      }

      logger.info(
        {
          tenantId: input.tenantId,
          lineMessageId: input.lineMessageId,
          downloadAttempted: true,
          downloadSuccess,
          uploadSuccess: true,
          thumbnailGenerated: true
        },
        "LINE inbound image processed"
      );

      return { ok: true, mediaUrl, previewUrl, byteSize: originalJpeg.length };
    } catch (error) {
      logger.warn(
        {
          tenantId: input.tenantId,
          lineMessageId: input.lineMessageId,
          downloadAttempted: true,
          downloadSuccess,
          uploadSuccess: false,
          thumbnailGenerated: false,
          error: String(error)
        },
        "LINE inbound image processing failed"
      );
      return { ok: false, reason: "storage/thumbnail processing failed" };
    }
  }
}

