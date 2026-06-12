import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeSourcePostThumbnailUrl,
  sanitizeSourcePostThumbnailUrl
} from "./sourcePostThumbnailSanitize.js";

test("sanitizeSourcePostThumbnailUrl keeps safe HTTPS post media URLs", () => {
  assert.equal(
    sanitizeSourcePostThumbnailUrl("https://cdn.example.com/post-thumb.jpg"),
    "https://cdn.example.com/post-thumb.jpg"
  );
});

test("sanitizeSourcePostThumbnailUrl rejects profile and non-HTTPS URLs", () => {
  assert.equal(sanitizeSourcePostThumbnailUrl("https://fbcdn.net/profile_pic.jpg"), null);
  assert.equal(sanitizeSourcePostThumbnailUrl("http://cdn.example.com/post.jpg"), null);
  assert.equal(sanitizeSourcePostThumbnailUrl("javascript:alert(1)"), null);
});

test("isSafeSourcePostThumbnailUrl matches sanitize behavior", () => {
  assert.equal(isSafeSourcePostThumbnailUrl("https://cdn.example.com/post.jpg"), true);
  assert.equal(isSafeSourcePostThumbnailUrl("https://fbcdn.net/profile_pic.jpg"), false);
});
