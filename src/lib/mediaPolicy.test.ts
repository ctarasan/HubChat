import test from "node:test";
import assert from "node:assert/strict";
import {
  formatChannelImageTooLargeError,
  formatUploadTooLargeError,
  isAllowedOutboundImageMime,
  MEDIA_META_IMAGE_MAX_BYTES,
  MEDIA_OUTBOUND_SIGNED_URL_DEFAULT_TTL_SEC,
  MEDIA_RETENTION_POLICY_RECOMMENDATIONS,
  MEDIA_SEND_MAX_FILE_BYTES,
  MEDIA_UPLOAD_MAX_BYTES,
  resolveInboundSignedUrlTtlSec,
  resolveMessageMediaUrls,
  resolveOutboundSignedUrlTtlSec,
  validateChannelMediaFileSize,
  validateInstagramOutboundImageMedia
} from "./mediaPolicy.js";
import {
  INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL,
  INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME
} from "../domain/instagramDmMessages.js";

test("resolveOutboundSignedUrlTtlSec enforces minimum 1 hour", () => {
  assert.equal(resolveOutboundSignedUrlTtlSec("60"), 3600);
  assert.equal(resolveOutboundSignedUrlTtlSec(undefined), MEDIA_OUTBOUND_SIGNED_URL_DEFAULT_TTL_SEC);
});

test("resolveInboundSignedUrlTtlSec defaults to 7 days", () => {
  assert.equal(resolveInboundSignedUrlTtlSec(undefined), 60 * 60 * 24 * 7);
});

test("validateChannelMediaFileSize enforces upload and Meta image caps", () => {
  assert.equal(
    validateChannelMediaFileSize({
      channel: "LINE",
      messageType: "image",
      fileSizeBytes: MEDIA_UPLOAD_MAX_BYTES + 1
    }),
    `Attachment exceeds upload limit (${Math.floor(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024))}MB)`
  );
  assert.equal(
    validateChannelMediaFileSize({
      channel: "FACEBOOK",
      messageType: "image",
      fileSizeBytes: MEDIA_META_IMAGE_MAX_BYTES + 1
    }),
    formatChannelImageTooLargeError("FACEBOOK")
  );
  assert.equal(
    validateChannelMediaFileSize({
      channel: "INSTAGRAM",
      messageType: "image",
      fileSizeBytes: MEDIA_META_IMAGE_MAX_BYTES
    }),
    null
  );
});

test("resolveMessageMediaUrls prefers distinct preview over duplicate full URL", () => {
  const urls = resolveMessageMediaUrls({
    messageType: "IMAGE",
    mediaUrl: "https://cdn.example/full.jpg",
    previewUrl: "https://cdn.example/full.jpg",
    metadataJson: { thumbnailUrl: "https://cdn.example/thumb.jpg" }
  });
  assert.equal(urls.originalUrl, "https://cdn.example/full.jpg");
  assert.equal(urls.previewUrl, "https://cdn.example/thumb.jpg");
  assert.equal(urls.downloadUrl, "https://cdn.example/full.jpg");
});

test("resolveMessageMediaUrls uses preview fallback for download when original URL is missing", () => {
  const urls = resolveMessageMediaUrls({
    messageType: "IMAGE",
    metadataJson: { thumbnailUrl: "https://cdn.example/thumb-only.jpg" }
  });
  assert.equal(urls.originalUrl, null);
  assert.equal(urls.downloadUrl, "https://cdn.example/thumb-only.jpg");
  assert.equal(urls.previewUrl, null);
});

test("resolveMessageMediaUrls omits preview when only duplicate of original exists", () => {
  const urls = resolveMessageMediaUrls({
    messageType: "IMAGE",
    mediaUrl: "https://cdn.example/same.jpg",
    previewUrl: "https://cdn.example/same.jpg"
  });
  assert.equal(urls.previewUrl, null);
  assert.equal(urls.downloadUrl, "https://cdn.example/same.jpg");
});

test("isAllowedOutboundImageMime accepts jpeg png webp only", () => {
  assert.equal(isAllowedOutboundImageMime("image/jpeg"), true);
  assert.equal(isAllowedOutboundImageMime("image/gif"), false);
});

test("formatUploadTooLargeError references upload cap", () => {
  assert.match(formatUploadTooLargeError("image"), /10MB/);
});

test("MEDIA_RETENTION_POLICY_RECOMMENDATIONS documents future lifecycle", () => {
  assert.equal(MEDIA_RETENTION_POLICY_RECOMMENDATIONS.maxUploadBytes, MEDIA_UPLOAD_MAX_BYTES);
  assert.ok(MEDIA_RETENTION_POLICY_RECOMMENDATIONS.originalMediaRetentionDays >= 1);
});

test("validateInstagramOutboundImageMedia accepts JPEG HTTPS URL within Meta cap", () => {
  assert.equal(
    validateInstagramOutboundImageMedia({
      mediaUrl: "https://cdn.example.com/a.jpg",
      mediaMimeType: "image/jpeg",
      fileSizeBytes: MEDIA_META_IMAGE_MAX_BYTES
    }),
    null
  );
});

test("validateInstagramOutboundImageMedia rejects non-HTTPS URL", () => {
  assert.equal(
    validateInstagramOutboundImageMedia({
      mediaUrl: "http://cdn.example.com/a.jpg",
      mediaMimeType: "image/jpeg"
    }),
    INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL
  );
});

test("validateInstagramOutboundImageMedia rejects unsupported MIME", () => {
  assert.equal(
    validateInstagramOutboundImageMedia({
      mediaUrl: "https://cdn.example.com/a.gif",
      mediaMimeType: "image/gif"
    }),
    INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME
  );
});

test("validateInstagramOutboundImageMedia enforces Instagram 8MB cap", () => {
  assert.equal(
    validateInstagramOutboundImageMedia({
      mediaUrl: "https://cdn.example.com/big.jpg",
      mediaMimeType: "image/jpeg",
      fileSizeBytes: MEDIA_META_IMAGE_MAX_BYTES + 1
    }),
    formatChannelImageTooLargeError("INSTAGRAM")
  );
});
