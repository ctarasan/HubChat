import test from "node:test";
import assert from "node:assert/strict";
import type { MessageDeliveryFailurePayload } from "../../../domain/ports.js";
import { SupabaseMessageRepository } from "./supabaseMessageRepository.js";

function makeSupabaseMock(rowFactory: (insertPayload: Record<string, unknown>) => Record<string, unknown>) {
  let capturedInsertPayload: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        capturedInsertPayload = payload;
        return {
          select: (_cols: string) => ({
            single: async () => ({
              data: rowFactory(payload),
              error: null
            })
          })
        };
      }
    })
  } as any;
  return {
    repo: new SupabaseMessageRepository(supabase),
    getInsertPayload: () => capturedInsertPayload
  };
}

test("create persists metadata_json and falls back media columns from metadata", async () => {
  const { repo, getInsertPayload } = makeSupabaseMock((payload) => ({
    id: "msg-1",
    tenant_id: payload.tenant_id,
    conversation_id: payload.conversation_id,
    channel_type: payload.channel_type,
    external_message_id: payload.external_message_id,
    message_type: payload.message_type,
    direction: payload.direction,
    sender_type: payload.sender_type,
    content: payload.content,
    media_url: payload.media_url,
    preview_url: payload.preview_url,
    metadata_json: payload.metadata_json,
    created_at: "2026-04-27T00:00:00.000Z"
  }));

  const created = await repo.create({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    channelType: "LINE",
    externalMessageId: "m-1",
    messageType: "IMAGE",
    direction: "INBOUND",
    senderType: "CUSTOMER",
    content: "",
    metadataJson: {
      source: "line",
      lineMessageId: "line-msg-1",
      mediaUrl: "https://cdn.example/original.jpg",
      previewUrl: "https://cdn.example/thumb.jpg"
    }
  });

  const payload = getInsertPayload();
  assert.ok(payload);
  assert.equal(payload?.media_url, "https://cdn.example/original.jpg");
  assert.equal(payload?.preview_url, "https://cdn.example/thumb.jpg");
  assert.equal((payload?.metadata_json as Record<string, unknown>)?.source, "line");
  assert.equal((payload?.metadata_json as Record<string, unknown>)?.lineMessageId, "line-msg-1");
  assert.equal(created.messageType, "IMAGE");
  assert.equal(created.mediaUrl, "https://cdn.example/original.jpg");
  assert.equal(created.previewUrl, "https://cdn.example/thumb.jpg");
  assert.equal(created.metadataJson?.lineMessageId, "line-msg-1");
});

test("create prefers explicit mediaUrl/previewUrl over metadata values", async () => {
  const { repo, getInsertPayload } = makeSupabaseMock((payload) => ({
    id: "msg-2",
    tenant_id: payload.tenant_id,
    conversation_id: payload.conversation_id,
    channel_type: payload.channel_type,
    external_message_id: payload.external_message_id,
    message_type: payload.message_type,
    direction: payload.direction,
    sender_type: payload.sender_type,
    content: payload.content,
    media_url: payload.media_url,
    preview_url: payload.preview_url,
    metadata_json: payload.metadata_json,
    created_at: "2026-04-27T00:00:00.000Z"
  }));

  await repo.create({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    channelType: "LINE",
    externalMessageId: "m-2",
    messageType: "IMAGE",
    direction: "INBOUND",
    senderType: "CUSTOMER",
    content: "",
    mediaUrl: "https://cdn.example/explicit-original.jpg",
    previewUrl: "https://cdn.example/explicit-thumb.jpg",
    metadataJson: {
      source: "line",
      lineMessageId: "line-msg-2",
      mediaUrl: "https://cdn.example/metadata-original.jpg",
      previewUrl: "https://cdn.example/metadata-thumb.jpg"
    }
  });

  const payload = getInsertPayload();
  assert.ok(payload);
  assert.equal(payload?.media_url, "https://cdn.example/explicit-original.jpg");
  assert.equal(payload?.preview_url, "https://cdn.example/explicit-thumb.jpg");
});

test("mapMessage returns media fields from snake_case row values", async () => {
  const { repo } = makeSupabaseMock(() => ({
    id: "msg-3",
    tenant_id: "tenant-1",
    conversation_id: "conv-1",
    channel_type: "LINE",
    external_message_id: "m-3",
    message_type: "IMAGE",
    direction: "INBOUND",
    sender_type: "CUSTOMER",
    content: "[image]",
    media_url: "https://cdn.example/row-original.jpg",
    preview_url: "https://cdn.example/row-thumb.jpg",
    metadata_json: {
      source: "line",
      lineMessageId: "line-msg-3"
    },
    created_at: "2026-04-27T00:00:00.000Z"
  }));

  const created = await repo.create({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    channelType: "LINE",
    externalMessageId: "m-3",
    messageType: "IMAGE",
    direction: "INBOUND",
    senderType: "CUSTOMER",
    content: "[image]",
    metadataJson: {
      source: "line",
      lineMessageId: "line-msg-3"
    }
  });

  assert.equal(created.messageType, "IMAGE");
  assert.equal(created.mediaUrl, "https://cdn.example/row-original.jpg");
  assert.equal(created.previewUrl, "https://cdn.example/row-thumb.jpg");
  assert.equal(created.metadataJson?.lineMessageId, "line-msg-3");
});

test("markFailed persists delivery_error_code and delivery_error_message in metadata_json", async () => {
  let updatedMetadata: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _id: string) => ({
          maybeSingle: async () => ({
            data: { metadata_json: { existing: true } },
            error: null
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        updatedMetadata = patch.metadata_json as Record<string, unknown>;
        return {
          eq: async (_col: string, _val: string) => ({ error: null })
        };
      }
    })
  } as any;
  const repo = new SupabaseMessageRepository(supabase);
  const failure: MessageDeliveryFailurePayload = {
    userFacingMessage: "ส่งไม่ผ่าน: test reason",
    deliveryErrorCode: "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW",
    technicalReason: "technical"
  };
  await repo.markFailed("msg-fail-1", failure);
  assert.ok(updatedMetadata);
  const meta = updatedMetadata as Record<string, unknown>;
  assert.equal(meta.delivery_status, "FAILED");
  assert.equal(meta.delivery_error_code, "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW");
  assert.equal(meta.delivery_error_message, "ส่งไม่ผ่าน: test reason");
  assert.equal(meta.reason, "technical");
  assert.equal(typeof meta.failed_at, "string");
  assert.equal(typeof meta.delivery_failed_at, "string");
});

test("listByConversation uses schema-aligned select without non-existent message columns", async () => {
  let capturedSelect = "";
  const supabase = {
    from: (_table: string) => ({
      select: (cols: string) => {
        capturedSelect = cols;
        return {
          eq: () => ({
            in: () => ({
              order: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null })
                })
              })
            })
          })
        };
      }
    })
  } as any;
  const repo = new SupabaseMessageRepository(supabase);
  await repo.listByConversationIds({
    tenantId: "tenant-1",
    conversationIds: ["conv-1", "conv-2"],
    limit: 10
  });
  assert.match(capturedSelect, /created_at/);
  assert.doesNotMatch(capturedSelect, /occurred_at/);
  assert.doesNotMatch(capturedSelect, /media_mime_type/);
  assert.doesNotMatch(capturedSelect, /file_name/);
});

test("mapMessage reads file metadata when file_name column is absent", async () => {
  const { repo } = makeSupabaseMock(() => ({
    id: "msg-meta-1",
    tenant_id: "tenant-1",
    conversation_id: "conv-1",
    channel_type: "FACEBOOK",
    external_message_id: "m-meta",
    message_type: "DOCUMENT_PDF",
    direction: "INBOUND",
    sender_type: "CUSTOMER",
    content: "[PDF]",
    created_at: "2026-04-27T00:00:00.000Z",
    metadata_json: {
      fileName: "quote.pdf",
      mediaMimeType: "application/pdf",
      fileSizeBytes: 1200
    }
  }));
  const created = await repo.create({
    tenantId: "tenant-1",
    conversationId: "conv-1",
    channelType: "FACEBOOK",
    externalMessageId: "m-meta",
    messageType: "DOCUMENT_PDF",
    direction: "INBOUND",
    senderType: "CUSTOMER",
    content: "[PDF]",
    metadataJson: {
      fileName: "quote.pdf",
      mediaMimeType: "application/pdf",
      fileSizeBytes: 1200
    }
  });
  assert.equal(created.fileName, "quote.pdf");
  assert.equal(created.mediaMimeType, "application/pdf");
  assert.equal(created.fileSizeBytes, 1200);
});

test("markSent clears prior failure metadata fields", async () => {
  let updatedMetadata: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _id: string) => ({
          maybeSingle: async () => ({
            data: {
              metadata_json: {
                delivery_status: "FAILED",
                failed_at: "2020-01-01",
                delivery_failed_at: "2020-01-01",
                delivery_error_code: "X",
                delivery_error_message: "old",
                reason: "old reason",
                keep: true
              }
            },
            error: null
          })
        })
      }),
      update: (patch: Record<string, unknown>) => {
        updatedMetadata = patch.metadata_json as Record<string, unknown>;
        return {
          eq: async (_col: string, _val: string) => ({ error: null })
        };
      }
    })
  } as any;
  const repo = new SupabaseMessageRepository(supabase);
  await repo.markSent("msg-sent-1", "ext-1");
  assert.ok(updatedMetadata);
  const meta = updatedMetadata as Record<string, unknown>;
  assert.equal(meta.delivery_status, "SENT");
  assert.equal(meta.keep, true);
  assert.equal("failed_at" in meta, false);
  assert.equal("delivery_failed_at" in meta, false);
  assert.equal("delivery_error_code" in meta, false);
  assert.equal("delivery_error_message" in meta, false);
  assert.equal("reason" in meta, false);
});

test("findLatestInboundSourcePostMetadataByConversationIds picks latest inbound snippet per conversation", async () => {
  const calls: string[] = [];
  const rows = [
    {
      conversation_id: "conv-a",
      metadata_json: {
        source_post_snippet: "Newest parent post",
        source_post_captured_at: "2026-06-01T09:00:00.000Z",
        source_post_source: "ingest_graph"
      },
      created_at: "2026-06-01T09:00:00.000Z",
      id: "m-new"
    },
    {
      conversation_id: "conv-a",
      metadata_json: {
        source_post_snippet: "Older parent post",
        source_post_captured_at: "2026-06-01T08:00:00.000Z"
      },
      created_at: "2026-06-01T08:00:00.000Z",
      id: "m-old"
    },
    {
      conversation_id: "conv-b",
      metadata_json: {
        source_post_snippet: "https://www.facebook.com/unsafe/",
        comment_id: "secret"
      },
      created_at: "2026-06-01T09:30:00.000Z",
      id: "m-unsafe"
    }
  ];
  const supabase = {
    from: (_table: string) => {
      const query: any = {
        select: (_cols: string) => query,
        eq: (col: string, val: string) => {
          calls.push(`eq:${col}:${val}`);
          return query;
        },
        in: (col: string, vals: string[]) => {
          calls.push(`in:${col}:${vals.join(",")}`);
          return query;
        },
        not: (col: string, op: string, val: unknown) => {
          calls.push(`not:${col}:${op}:${String(val)}`);
          return query;
        },
        order: () => query,
        limit: (n: number) => {
          calls.push(`limit:${n}`);
          return query;
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: rows, error: null });
        }
      };
      return query;
    }
  } as any;
  const repo = new SupabaseMessageRepository(supabase);
  const result = await repo.findLatestInboundSourcePostMetadataByConversationIds({
    tenantId: "tenant-1",
    conversationIds: ["conv-a", "conv-b", "conv-c"]
  });
  assert.equal(calls.includes("eq:direction:INBOUND"), true);
  assert.equal(calls.includes("in:conversation_id:conv-a,conv-b,conv-c"), true);
  assert.equal(calls.some((c) => c.startsWith("not:metadata_json->source_post_snippet:")), true);
  assert.equal(result.get("conv-a")?.source_post_snippet, "Newest parent post");
  assert.equal(result.has("conv-b"), false);
});

