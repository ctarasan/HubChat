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
  private readonly signedUrlTtlSec: number;

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
    this.signedUrlTtlSec = Math.max(
      3600,
      toPositiveInt(process.env.INBOUND_MEDIA_SIGNED_URL_TTL_SEC, this.deps.signedUrlTtlSec ?? 60 * 60 * 24 * 7)
    );
  }

  private async resolveStorageUrls(input: {
    originalPath: string;
    thumbPath: string;
  }): Promise<{
    mediaUrl: string;
    previewUrl: string;
    urlMode: "public" | "signed";
    signedUrlExpiresInSec?: number;
  }> {
    if (this.urlMode === "public") {
      const mediaPub = this.supabase.storage.from(this.bucket).getPublicUrl(input.originalPath);
      const previewPub = this.supabase.storage.from(this.bucket).getPublicUrl(input.thumbPath);
      return {
        mediaUrl: mediaPub.data.publicUrl,
        previewUrl: previewPub.data.publicUrl,
        urlMode: "public"
      };
    }
    const mediaSigned = await this.supabase.storage.from(this.bucket).createSignedUrl(input.originalPath, this.signedUrlTtlSec);
    if (mediaSigned.error) throw mediaSigned.error;
    const previewSigned = await this.supabase.storage.from(this.bucket).createSignedUrl(input.thumbPath, this.signedUrlTtlSec);
    if (previewSigned.error) throw previewSigned.error;
    return {
      mediaUrl: mediaSigned.data.signedUrl,
      previewUrl: previewSigned.data.signedUrl,
      urlMode: "signed",
      signedUrlExpiresInSec: this.signedUrlTtlSec
    };
  }

  async processLineImage(input: {
    tenantId: string;
    lineMessageId: string;
  }): Promise<{
    mediaUrl: string;
    previewUrl: string;
    metadata: {
      storageBucket: string;
      originalPath: string;
      thumbPath: string;
      urlMode: "public" | "signed";
      signedUrlExpiresInSec?: number;
      mediaUrl: string;
      previewUrl: string;
    };
  }> {
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        downloadAttempted: false
      },
      "processLineImage called"
    );
    const token = this.deps.lineChannelAccessToken;
    if (!token) throw new Error("LINE access token missing");
    const contentUrl = `https://api-data.line.me/v2/bot/message/${encodeURIComponent(input.lineMessageId)}/content`;
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
          messageId: input.lineMessageId,
          downloadAttempted: true,
          downloadSuccess: false,
          uploadSuccess: false,
          thumbnailGenerated: false,
          status: res.status
        },
        "LINE inbound image download failed"
      );
      throw new Error(`LINE content API failed (${res.status})`);
    }
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        downloadAttempted: true,
        downloadSuccess: true,
        downloadStatus: res.status
      },
      "LINE content API download succeeded"
    );
    const arr = await res.arrayBuffer();
    const originalBytes = Buffer.from(arr);
    const contentType = String(res.headers.get("content-type") ?? "image/jpeg").toLowerCase();
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        contentType
      },
      "LINE inbound content-type detected"
    );

    if (!originalBytes || originalBytes.length === 0) throw new Error("LINE image content empty");
    if (originalBytes.length > this.maxSizeBytes) throw new Error("LINE image exceeds max size");

    const originalPath = `inbound/${input.tenantId}/line/original/${input.lineMessageId}.jpg`;
    const thumbPath = `inbound/${input.tenantId}/line/thumb/${input.lineMessageId}.jpg`;
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        originalUploadPath: originalPath,
        thumbnailUploadPath: thumbPath
      },
      "LINE inbound upload paths resolved"
    );
    if (!contentType.startsWith("image/")) {
      logger.warn(
        {
          tenantId: input.tenantId,
          messageId: input.lineMessageId,
          downloadAttempted: true,
          downloadSuccess: true,
          uploadSuccess: false,
          thumbnailGenerated: false,
          contentType
        },
        "LINE inbound image unexpected content-type"
      );
    }
    const source = sharp(originalBytes);
    const originalJpeg = await source.clone().jpeg({ quality: 82 }).toBuffer();
    const thumbnailJpeg = await source
      .clone()
      .resize({ width: 400, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const uploadedOriginal = await this.supabase.storage.from(this.bucket).upload(originalPath, originalJpeg, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000"
    });
    if (uploadedOriginal.error) {
      logger.warn(
        {
          tenantId: input.tenantId,
          lineMessageId: input.lineMessageId,
          originalUploadPath: originalPath,
          originalUploadSuccess: false,
          error: String(uploadedOriginal.error.message ?? uploadedOriginal.error)
        },
        "LINE inbound original upload failed"
      );
      throw new Error(`LINE original upload failed: ${String(uploadedOriginal.error.message ?? uploadedOriginal.error)}`);
    }
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        originalUploadPath: originalPath,
        originalUploadSuccess: true
      },
      "LINE inbound original upload succeeded"
    );

    const uploadedThumb = await this.supabase.storage.from(this.bucket).upload(thumbPath, thumbnailJpeg, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000"
    });
    if (uploadedThumb.error) {
      logger.warn(
        {
          tenantId: input.tenantId,
          lineMessageId: input.lineMessageId,
          thumbnailUploadPath: thumbPath,
          thumbnailUploadSuccess: false,
          error: String(uploadedThumb.error.message ?? uploadedThumb.error)
        },
        "LINE inbound thumbnail upload failed"
      );
      throw new Error(`LINE thumbnail upload failed: ${String(uploadedThumb.error.message ?? uploadedThumb.error)}`);
    }
    logger.info(
      {
        tenantId: input.tenantId,
        lineMessageId: input.lineMessageId,
        thumbnailUploadPath: thumbPath,
        thumbnailUploadSuccess: true
      },
      "LINE inbound thumbnail upload succeeded"
    );

    const resolvedUrls = await this.resolveStorageUrls({ originalPath, thumbPath });
    const mediaUrl = resolvedUrls.mediaUrl;
    const previewUrl = resolvedUrls.previewUrl;
    if (!isHttpsUrl(mediaUrl) || !isHttpsUrl(previewUrl)) {
      throw new Error("Generated inbound media URL is not HTTPS");
    }

    const resultMetadata = {
      storageBucket: this.bucket,
      originalPath,
      thumbPath,
      urlMode: resolvedUrls.urlMode,
      ...(typeof resolvedUrls.signedUrlExpiresInSec === "number"
        ? { signedUrlExpiresInSec: resolvedUrls.signedUrlExpiresInSec }
        : {}),
      mediaUrl,
      previewUrl
    };

    logger.info(
      {
        tenantId: input.tenantId,
        messageId: input.lineMessageId,
        bucket: this.bucket,
        originalPath,
        thumbPath,
        urlMode: resolvedUrls.urlMode,
        signedUrlExpiresInSec: resolvedUrls.signedUrlExpiresInSec ?? null,
        hasMediaUrl: Boolean(mediaUrl),
        hasPreviewUrl: Boolean(previewUrl),
        downloadAttempted: true,
        downloadSuccess: true,
        uploadSuccess: true,
        thumbnailGenerated: true,
        mediaUrl,
        previewUrl
      },
      "LINE inbound image processed"
    );

    return { mediaUrl, previewUrl, metadata: resultMetadata };
  }
}

