import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourcePostMetadataForInbound } from "./sourcePostIngestEnrichment.js";

test("resolveSourcePostMetadataForInbound returns payload snippet without Graph fetch", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "TEXT",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {
      source_post_snippet: "From webhook payload",
      source_post_captured_at: "2026-06-01T09:00:00.000Z",
      source_post_source: "ingest_graph"
    },
    facebookPostId: "post_ref",
    fetchPostMessage: async () => {
      throw new Error("Graph should not be called");
    }
  });
  assert.equal(resolved.metadata.source_post_snippet, "From webhook payload");
  assert.equal(resolved.diagnostics.source_post_snippet_present, true);
  assert.equal(resolved.diagnostics.source_post_enrichment_failed_reason, null);
});

test("resolveSourcePostMetadataForInbound fetches post message when payload metadata empty", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "TEXT",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {},
    facebookPostId: "post_ref",
    capturedAt: "2026-06-01T09:00:00.000Z",
    fetchPostMessage: async () => ({
      ok: true as const,
      message: "Parent post text",
      thumbnailUrl: "https://cdn.example.com/post-thumb.jpg"
    })
  });
  assert.equal(resolved.metadata.source_post_snippet, "Parent post text");
  assert.equal(resolved.metadata.source_post_thumbnail_url, "https://cdn.example.com/post-thumb.jpg");
  assert.equal(resolved.metadata.source_post_source, "ingest_graph");
  assert.equal(resolved.diagnostics.source_post_snippet_present, true);
});

test("resolveSourcePostMetadataForInbound ignores Facebook payload thumbnail-only and fetches Graph", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "TEXT",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {
      source_post_thumbnail_url: "https://cdn.example.com/comment-attachment.jpg",
      source_post_captured_at: "2026-06-01T09:00:00.000Z",
      source_post_source: "webhook_payload"
    },
    facebookPostId: "post_ref",
    fetchPostMessage: async () => ({
      ok: true as const,
      message: "Parent post text",
      thumbnailUrl: "https://cdn.example.com/parent-full-picture.jpg"
    })
  });
  assert.equal(resolved.metadata.source_post_snippet, "Parent post text");
  assert.equal(resolved.metadata.source_post_thumbnail_url, "https://cdn.example.com/parent-full-picture.jpg");
  assert.notEqual(resolved.metadata.source_post_thumbnail_url, "https://cdn.example.com/comment-attachment.jpg");
});

test("resolveSourcePostMetadataForInbound keeps Facebook snippet without payload thumbnail", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "TEXT",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {
      source_post_snippet: "From webhook payload",
      source_post_thumbnail_url: "https://cdn.example.com/comment-attachment.jpg",
      source_post_captured_at: "2026-06-01T09:00:00.000Z",
      source_post_source: "ingest_graph"
    },
    facebookPostId: "post_ref",
    fetchPostMessage: async () => {
      throw new Error("Graph should not be called");
    }
  });
  assert.equal(resolved.metadata.source_post_snippet, "From webhook payload");
  assert.equal(resolved.metadata.source_post_thumbnail_url, undefined);
});

test("resolveSourcePostMetadataForInbound keeps Instagram webhook thumbnail when snippet already present", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "INSTAGRAM",
    messageType: "TEXT",
    sourceThreadType: "INSTAGRAM_COMMENT",
    payloadMetadataJson: {
      source_post_snippet: "IG parent caption",
      source_post_thumbnail_url: "https://cdn.example.com/ig-parent-thumb.jpg",
      source_post_captured_at: "2026-06-01T09:00:00.000Z",
      source_post_source: "ingest_graph"
    },
    fetchPostMessage: async () => {
      throw new Error("Graph should not be called");
    }
  });
  assert.equal(resolved.metadata.source_post_thumbnail_url, "https://cdn.example.com/ig-parent-thumb.jpg");
  assert.equal(resolved.diagnostics.source_post_snippet_present, true);
});

test("resolveSourcePostMetadataForInbound is fail-open when Graph fetch fails", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "TEXT",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {},
    facebookPostId: "post_ref",
    fetchPostMessage: async () => ({ ok: false as const, reason: "missing_access_token" })
  });
  assert.deepEqual(resolved.metadata, {});
  assert.equal(resolved.diagnostics.source_post_enrichment_failed_reason, "missing_access_token");
});

test("resolveSourcePostMetadataForInbound passes through Instagram payload snippet without Graph fetch", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "INSTAGRAM",
    messageType: "TEXT",
    sourceThreadType: "INSTAGRAM_COMMENT",
    payloadMetadataJson: {
      source_post_snippet: "IG parent caption from webhook",
      source_post_captured_at: "2026-06-01T09:00:00.000Z",
      source_post_source: "ingest_graph"
    },
    fetchPostMessage: async () => {
      throw new Error("Graph should not be called");
    }
  });
  assert.equal(resolved.metadata.source_post_snippet, "IG parent caption from webhook");
  assert.deepEqual(Object.keys(resolved.metadata).sort(), [
    "source_post_captured_at",
    "source_post_snippet",
    "source_post_source"
  ]);
  assert.equal(resolved.diagnostics.source_post_snippet_present, true);
});

test("resolveSourcePostMetadataForInbound drops unsafe Instagram payload metadata", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "INSTAGRAM",
    messageType: "TEXT",
    sourceThreadType: "INSTAGRAM_COMMENT",
    payloadMetadataJson: {
      source_post_snippet: "https://www.instagram.com/p/unsafe/",
      comment_id: "secret",
      rawPayload: { token: "x" }
    },
    fetchPostMessage: async () => ({ ok: true as const, message: "should not fetch", thumbnailUrl: null })
  });
  assert.deepEqual(resolved.metadata, {});
  assert.equal(resolved.diagnostics.source_post_enrichment_failed_reason, "not_applicable");
});

test("resolveSourcePostMetadataForInbound enriches Facebook comment IMAGE messages from Graph", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "FACEBOOK",
    messageType: "IMAGE",
    sourceThreadType: "FACEBOOK_COMMENT",
    payloadMetadataJson: {},
    facebookPostId: "post_ref",
    fetchPostMessage: async () => ({
      ok: true as const,
      message: "Parent post text",
      thumbnailUrl: "https://cdn.example.com/parent-full-picture.jpg"
    })
  });
  assert.equal(resolved.metadata.source_post_snippet, "Parent post text");
  assert.equal(resolved.metadata.source_post_thumbnail_url, "https://cdn.example.com/parent-full-picture.jpg");
});

test("resolveSourcePostMetadataForInbound skips non-comment channels", async () => {
  const resolved = await resolveSourcePostMetadataForInbound({
    channel: "LINE",
    messageType: "TEXT",
    payloadMetadataJson: { source_post_snippet: "should strip" },
    fetchPostMessage: async () => ({ ok: true as const, message: "nope", thumbnailUrl: null })
  });
  assert.deepEqual(resolved.metadata, {});
  assert.equal(resolved.diagnostics.source_post_enrichment_failed_reason, "not_applicable");
});
