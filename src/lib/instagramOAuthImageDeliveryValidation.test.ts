import test from "node:test";
import assert from "node:assert/strict";
import {
  maskInstagramOAuthImageUrlForLog,
  validateInstagramOAuthImageDeliveryMedia
} from "./instagramOAuthImageDeliveryValidation.js";

const VALID_URL = "https://cdn.example.test/outbound/photo.jpg";

test("validateInstagramOAuthImageDeliveryMedia accepts public HTTPS JPEG URL", () => {
  const result = validateInstagramOAuthImageDeliveryMedia({
    imageUrl: VALID_URL,
    mediaMimeType: "image/jpeg",
    fileSizeBytes: 1024
  });
  assert.equal(result.imageUrl, VALID_URL);
  assert.equal(result.urlHost, "cdn.example.test");
});

test("validateInstagramOAuthImageDeliveryMedia rejects HTTP URL", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "http://cdn.example.test/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    (err: unknown) => (err as { code?: string }).code === "IMAGE_URL_INVALID"
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects localhost", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "https://localhost/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    /host is not allowed/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects loopback IP", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "https://127.0.0.1/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    /host is not allowed/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects private network IP", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "https://192.168.1.10/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    /host is not allowed/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects embedded credentials", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "https://user:secret@cdn.example.test/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    /embedded credentials/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects data URL", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "data:image/jpeg;base64,abc",
        mediaMimeType: "image/jpeg"
      }),
    /HTTPS/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects oversized URL", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: `https://cdn.example.test/${"a".repeat(5000)}.jpg`,
        mediaMimeType: "image/jpeg"
      }),
    /maximum length/
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects WEBP for OAuth contract", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: VALID_URL,
        mediaMimeType: "image/webp"
      }),
    (err: unknown) => (err as { code?: string }).code === "UNSUPPORTED_MEDIA"
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects image over Meta cap", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: VALID_URL,
        mediaMimeType: "image/png",
        fileSizeBytes: 9 * 1024 * 1024
      }),
    (err: unknown) => (err as { code?: string }).code === "MEDIA_TOO_LARGE"
  );
});

test("validateInstagramOAuthImageDeliveryMedia rejects profile avatar URL", () => {
  assert.throws(
    () =>
      validateInstagramOAuthImageDeliveryMedia({
        imageUrl: "https://cdn.example.test/users/avatar/photo.jpg",
        mediaMimeType: "image/jpeg"
      }),
    /profile or thumbnail/
  );
});

test("maskInstagramOAuthImageUrlForLog omits signed query parameters", () => {
  const masked = maskInstagramOAuthImageUrlForLog(
    "https://storage.example.test/outbound/abc.jpg?X-Amz-Signature=fakesignaturevalue"
  );
  assert.equal(masked.includes("X-Amz-Signature"), false);
  assert.equal(masked.includes("storage.example.test"), true);
});

test("validation errors do not include full signed URL", () => {
  const signed =
    "https://storage.example.test/outbound/abc.jpg?X-Amz-Signature=fakesignaturevalue";
  try {
    validateInstagramOAuthImageDeliveryMedia({
      imageUrl: signed,
      mediaMimeType: "image/webp"
    });
    assert.fail("expected error");
  } catch (err) {
    assert.equal(String(err).includes("fakesignaturevalue"), false);
  }
});
