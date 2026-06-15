import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChannelConnectionNotFoundError,
  SupabaseChannelConnectionRepository
} from "./supabaseChannelConnectionRepository.js";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "0123456789abcdef".repeat(4);
const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

type Row = Record<string, unknown>;

function buildRepository() {
  const connections: Row[] = [];
  const credentials: Row[] = [];

  const match = (row: Row, filters: Array<[string, unknown]>) =>
    filters.every(([column, value]) => row[column] === value);

  const queryBuilder = (table: "channel_connections" | "channel_credentials") => {
    let filters: Array<[string, unknown]> = [];
    let columns = "";
    let pendingUpdate: Row | null = null;
    let pendingInsert: Row | null = null;
    let pendingUpsert: Row | null = null;

    const rows = () => (table === "channel_connections" ? connections : credentials);

    const builder = {
      select(cols: string) {
        columns = cols;
        return builder;
      },
      insert(row: Row) {
        pendingInsert = row;
        return builder;
      },
      upsert(row: Row, _opts?: { onConflict: string }) {
        pendingUpsert = row;
        return builder;
      },
      update(patch: Row) {
        pendingUpdate = patch;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      order() {
        return Promise.resolve({
          data: rows().filter((row) => match(row, filters)),
          error: null
        });
      },
      maybeSingle: async () => {
        if (pendingInsert) {
          const id = crypto.randomUUID();
          const stored = {
            id,
            ...pendingInsert,
            webhook_active: pendingInsert.webhook_active ?? false,
            created_at: pendingInsert.created_at ?? new Date().toISOString(),
            updated_at: pendingInsert.updated_at ?? new Date().toISOString()
          };
          connections.push(stored);
          return { data: stored, error: null };
        }
        if (pendingUpsert) {
          const existing = credentials.find(
            (row) =>
              row.connection_id === pendingUpsert!.connection_id &&
              row.credential_type === pendingUpsert!.credential_type
          );
          const stored = existing
            ? Object.assign(existing, pendingUpsert, { id: existing.id })
            : { id: crypto.randomUUID(), ...pendingUpsert };
          if (!existing) credentials.push(stored);
          return { data: stored, error: null };
        }
        const found = rows().find((row) => match(row, filters)) ?? null;
        return { data: found, error: null };
      },
      single: async () => {
        if (pendingInsert) {
          const result = await builder.maybeSingle();
          if (!result.data) return { data: null, error: { message: "not found" } };
          return result;
        }
        if (pendingUpdate) {
          const found = rows().find((row) => match(row, filters));
          if (!found) return { data: null, error: { message: "not found" } };
          Object.assign(found, pendingUpdate, { updated_at: new Date().toISOString() });
          return { data: found, error: null };
        }
        if (pendingUpsert) {
          return builder.maybeSingle();
        }
        const found = rows().find((row) => match(row, filters));
        if (!found) return { data: null, error: { message: "not found" } };
        return { data: found, error: null };
      }
    };

    return builder;
  };

  const client = {
    from(table: string) {
      if (table === "channel_connections" || table === "channel_credentials") {
        return queryBuilder(table);
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  return {
    client,
    connections,
    credentials,
    queryBuilder
  };
}

test("CCW-1A migration adds conversations.channel_connection_id", () => {
  const sql = readFileSync(
    join(here, "../../../../supabase/migrations/20260608120000_ccw_1a_conversation_channel_connection_id.sql"),
    "utf8"
  );
  assert.match(sql, /channel_connection_id uuid null references channel_connections/i);
  assert.match(sql, /idx_conversations_channel_connection/i);
});

test("CCP-1 migration defines channel_connections and channel_credentials", () => {
  const sql = readFileSync(
    join(here, "../../../../supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql"),
    "utf8"
  );
  assert.match(sql, /create table if not exists channel_connections/i);
  assert.match(sql, /create table if not exists channel_credentials/i);
  assert.match(sql, /channel_connection_status/i);
  assert.match(sql, /unique \(tenant_id, provider\)/i);
  assert.match(sql, /unique \(public_connection_key\)/i);
});

test("create connection stores tenant-scoped row with public key", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({
    tenantId: TENANT,
    provider: "LINE",
    providerAccountId: "U1234567890",
    providerAccountName: "Demo OA"
  });
  assert.equal(created.provider, "LINE");
  assert.match(created.publicConnectionKey, /^ccp_/);
  assert.equal(created.status, "DRAFT");
});

test("update lifecycle status enforces transition rules", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "FACEBOOK" });
  const updated = await repo.updateLifecycleStatus({
    tenantId: TENANT,
    connectionId: created.id,
    status: "AUTHORIZING"
  });
  assert.equal(updated.status, "AUTHORIZING");
  const ready = await repo.updateLifecycleStatus({
    tenantId: TENANT,
    connectionId: created.id,
    status: "READY"
  });
  assert.equal(ready.status, "READY");
  await assert.rejects(
    () =>
      repo.updateLifecycleStatus({
        tenantId: TENANT,
        connectionId: created.id,
        status: "DRAFT"
      }),
    /Invalid channel connection status transition/
  );
});

test("update webhook status stores endpoint and active flag", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "INSTAGRAM" });
  await repo.updateLifecycleStatus({
    tenantId: TENANT,
    connectionId: created.id,
    status: "AUTHORIZING"
  });
  await repo.updateLifecycleStatus({
    tenantId: TENANT,
    connectionId: created.id,
    status: "CONNECTED"
  });
  const updated = await repo.updateWebhookStatus({
    tenantId: TENANT,
    connectionId: created.id,
    webhookEndpoint: "https://example.test/api/webhook/instagram",
    webhookActive: true,
    status: "WEBHOOK_CONFIGURED"
  });
  assert.equal(updated.webhookActive, true);
  assert.equal(updated.webhookEndpoint, "https://example.test/api/webhook/instagram");
  assert.equal(updated.status, "WEBHOOK_CONFIGURED");
});

test("store encrypted credential hides raw value in metadata", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "LINE" });
  const metadata = await repo.storeEncryptedCredential({
    tenantId: TENANT,
    connectionId: created.id,
    provider: "LINE",
    credentialType: "ACCESS_TOKEN",
    plaintextSecret: "fake-line-access-token-placeholder"
  });
  assert.equal(metadata.credentialState, "SET");
  assert.equal(metadata.credentialType, "ACCESS_TOKEN");
  assert.equal(JSON.stringify(metadata).includes("fake-line-access-token-placeholder"), false);
});

test("public summary returns credential badges only", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "LINE" });
  await repo.storeEncryptedCredential({
    tenantId: TENANT,
    connectionId: created.id,
    provider: "LINE",
    credentialType: "CHANNEL_SECRET",
    plaintextSecret: "fake-line-channel-secret-placeholder"
  });
  const summary = await repo.findPublicConnectionSummary(TENANT, created.id);
  assert.ok(summary);
  assert.equal(summary?.credentialStates.CHANNEL_SECRET, "SET");
  assert.equal(JSON.stringify(summary).includes("fake-line-channel-secret-placeholder"), false);
});

test("internal runtime retrieval decrypts stored credential", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "FACEBOOK" });
  await repo.storeEncryptedCredential({
    tenantId: TENANT,
    connectionId: created.id,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    plaintextSecret: "fake-page-access-token-placeholder"
  });
  assert.equal(typeof credentials[0]?.encrypted_secret_value, "string");
  assert.equal(String(credentials[0]?.encrypted_secret_value).includes("fake-page-access-token-placeholder"), false);
  const runtime = await repo.retrieveDecryptedCredentialForRuntime({
    tenantId: TENANT,
    connectionId: created.id,
    credentialType: "ACCESS_TOKEN"
  });
  assert.equal(runtime?.plaintextSecret, "fake-page-access-token-placeholder");
});

test("missing connection throws safe not found error", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  await assert.rejects(
    () =>
      repo.updateHealthFields({
        tenantId: TENANT,
        connectionId: "00000000-0000-0000-0000-000000000099",
        lastErrorCode: "CONNECTION_NOT_FOUND"
      }),
    (err: unknown) => err instanceof ChannelConnectionNotFoundError
  );
});

test("health update sanitizes unsafe error messages", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "INSTAGRAM" });
  const updated = await repo.updateHealthFields({
    tenantId: TENANT,
    connectionId: created.id,
    lastErrorCode: "PROVIDER_HEALTH_CHECK_FAILED",
    lastErrorMessageSafe: "Meta failed access_token=EAAGfakeTokenValue"
  });
  assert.equal(updated.lastErrorMessageSafe?.includes("EAAGfakeTokenValue"), false);
});

test("public_connection_key lookup works", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({
    tenantId: TENANT,
    provider: "LINE",
    publicConnectionKey: "ccp_lookup_key_for_test_case_01"
  });
  const found = await repo.findByPublicConnectionKey("ccp_lookup_key_for_test_case_01");
  assert.equal(found?.id, created.id);
});

test("tenant scoping blocks cross-tenant internal credential read", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseChannelConnectionRepository(client as any, TEST_KEY);
  const created = await repo.createConnection({ tenantId: TENANT, provider: "LINE" });
  await repo.storeEncryptedCredential({
    tenantId: TENANT,
    connectionId: created.id,
    provider: "LINE",
    credentialType: "ACCESS_TOKEN",
    plaintextSecret: "fake-token-for-tenant-scope-test"
  });
  const runtime = await repo.retrieveDecryptedCredentialForRuntime({
    tenantId: "other-tenant-id",
    connectionId: created.id,
    credentialType: "ACCESS_TOKEN"
  });
  assert.equal(runtime, null);
});

test("metadata select omits encrypted_secret_value", async () => {
  let selectColumns = "";
  const repo = new SupabaseChannelConnectionRepository(
    {
      from(table: string) {
        if (table !== "channel_credentials") throw new Error("unexpected");
        return {
          select(columns: string) {
            selectColumns = columns;
            return {
              eq() {
                return this;
              },
              order() {
                return Promise.resolve({ data: [], error: null });
              }
            };
          }
        };
      }
    } as any,
    TEST_KEY
  );
  await repo.listCredentialMetadataByConnection(TENANT, "conn-x");
  assert.equal(selectColumns.includes("encrypted_secret_value"), false);
});
