import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSISTED_SOURCE_POST_METADATA_KEYS,
  buildSafeSourcePostMetadata,
  extractPersistableSourcePostMetadata,
  hasPersistableSourcePostMetadata
} from "./sourcePostContextMetadata.js";

test("buildSafeSourcePostMetadata returns only allowlisted keys", () => {
  const meta = buildSafeSourcePostMetadata({
    sourcePostText: "Parent post caption",
    sourcePostThumbnailUrl: "https://cdn.example.com/post-thumb.jpg",
    source: "ingest_graph",
    capturedAt: "2026-06-01T09:00:00.000Z"
  });
  assert.deepEqual(Object.keys(meta).sort(), [...PERSISTED_SOURCE_POST_METADATA_KEYS].sort());
  assert.equal(meta.source_post_snippet, "Parent post caption");
  assert.equal(meta.source_post_thumbnail_url, "https://cdn.example.com/post-thumb.jpg");
  assert.equal(meta.source_post_source, "ingest_graph");
});

test("buildSafeSourcePostMetadata can persist thumbnail without snippet", () => {
  const meta = buildSafeSourcePostMetadata({
    sourcePostThumbnailUrl: "https://cdn.example.com/post-thumb.jpg",
    source: "webhook_payload",
    capturedAt: "2026-06-01T09:00:00.000Z"
  });
  assert.equal(meta.source_post_snippet, undefined);
  assert.equal(meta.source_post_thumbnail_url, "https://cdn.example.com/post-thumb.jpg");
  assert.equal(hasPersistableSourcePostMetadata(meta), true);
});

test("buildSafeSourcePostMetadata returns empty object for unsafe text", () => {
  assert.deepEqual(buildSafeSourcePostMetadata({ sourcePostText: "https://evil.example" }), {});
});

test("extractPersistableSourcePostMetadata strips unsafe companion keys", () => {
  const meta = extractPersistableSourcePostMetadata({
    source_post_snippet: "Safe caption",
    source_post_thumbnail_url: "https://cdn.example.com/post-thumb.jpg",
    source_post_captured_at: "2026-06-01T09:00:00.000Z",
    source_post_source: "webhook_payload",
    rawPayload: { secret: true },
    comment_id: "123_456",
    permalinkUrl: "https://www.facebook.com/x",
    access_token: "EAAG..."
  });
  assert.deepEqual(Object.keys(meta).sort(), [...PERSISTED_SOURCE_POST_METADATA_KEYS].sort());
  assert.equal(meta.source_post_snippet, "Safe caption");
  assert.equal(meta.source_post_thumbnail_url, "https://cdn.example.com/post-thumb.jpg");
  assert.equal("rawPayload" in meta, false);
  assert.equal("comment_id" in meta, false);
});
