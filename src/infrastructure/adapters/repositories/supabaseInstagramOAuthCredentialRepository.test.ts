import test from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_CONNECTION_PUBLIC_SELECT } from "../../../lib/channelConnectionPublicDto.js";
import { CHANNEL_CREDENTIAL_METADATA_SELECT } from "../../../lib/channelConnectionPublicDto.js";
import { INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT } from "../../../lib/instagramOAuthCredentialPublicDto.js";
import {
  InstagramOAuthCredentialNotFoundError,
  InstagramOAuthCredentialVersionConflictError,
  SupabaseInstagramOAuthCredentialRepository
} from "./supabaseInstagramOAuthCredentialRepository.js";

const TEST_KEY = "0123456789abcdef".repeat(4);
const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "da92d847-53cd-4b60-9e4d-5fd3f8ad8650";

type Row = Record<string, unknown>;

function buildRepository() {
  const credentials: Row[] = [];

  const queryBuilder = () => {
    let filters: Array<[string, unknown]> = [];
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let versionEq: number | null = null;
    let orderAsc = false;

    const match = (row: Row) => filters.every(([column, value]) => row[column] === value);

    const builder = {
      select(_cols: string) {
        return builder;
      },
      insert(row: Row) {
        pendingInsert = row;
        return builder;
      },
      update(patch: Row) {
        pendingUpdate = patch;
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "credential_version" && typeof value === "number") {
          versionEq = value;
        } else {
          filters.push([column, value]);
        }
        return builder;
      },
      order(_column: string, opts?: { ascending?: boolean }) {
        orderAsc = opts?.ascending ?? false;
        return builder;
      },
      maybeSingle: async () => {
        if (pendingInsert) {
          const id = crypto.randomUUID();
          const stored = {
            id,
            credential_version: 1,
            last_refresh_status: "NEVER",
            connection_health_status: "UNKNOWN",
            token_type: "bearer",
            access_token_ciphertext: "",
            ...pendingInsert
          };
          credentials.push(stored);
          pendingInsert = null;
          return { data: stored, error: null };
        }
        const found = credentials.find((row) => match(row)) ?? null;
        return { data: found, error: null };
      },
      single: async () => {
        if (pendingInsert) {
          return builder.maybeSingle();
        }
        if (pendingUpdate) {
          const found = credentials.find((row) => match(row));
          if (!found) return { data: null, error: { message: "not found" } };
          if (versionEq !== null && found.credential_version !== versionEq) {
            return { data: null, error: { message: "version conflict" } };
          }
          Object.assign(found, pendingUpdate, {
            credential_version:
              pendingUpdate.credential_version ?? (versionEq !== null ? versionEq + 1 : found.credential_version)
          });
          pendingUpdate = null;
          versionEq = null;
          filters = [];
          return { data: found, error: null };
        }
        const found = credentials.find((row) => match(row));
        if (!found) return { data: null, error: { message: "not found" } };
        return { data: found, error: null };
      },
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const rows = credentials
          .filter((row) => match(row))
          .sort((a, b) => {
            const aTime = String(a.created_at ?? "");
            const bTime = String(b.created_at ?? "");
            return orderAsc ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime);
          });
        resolve({ data: rows, error: null });
        return Promise.resolve();
      }
    };

    return builder;
  };

  const client = {
    from(table: string) {
      if (table !== "instagram_oauth_credentials") {
        throw new Error(`Unexpected table ${table}`);
      }
      return queryBuilder();
    }
  };

  return { client, credentials };
}

test("createPending stores tenant-scoped pending row", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const created = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  assert.equal(created.credentialStatus, "PENDING");
  assert.equal(created.authFamily, "INSTAGRAM_BUSINESS_LOGIN");
  assert.equal(created.tenantId, TENANT);
  assert.equal(JSON.stringify(created).includes("ciphertext"), false);
});

test("activate encrypts token and returns metadata without plaintext", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123",
    providerUserId: "meta-user-456"
  });
  assert.equal(activated.credentialStatus, "ACTIVE");
  assert.equal(activated.credentialVersion, 2);
  const stored = credentials.find((row) => row.id === pending.id);
  assert.equal(typeof stored?.access_token_ciphertext, "string");
  assert.equal(String(stored?.access_token_ciphertext).includes("test-instagram-access-token"), false);
  assert.equal(JSON.stringify(activated).includes("test-instagram-access-token"), false);
});

test("findByConnection requires tenant and connection", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const rows = await repo.findByConnection({ tenantId: TENANT, channelConnectionId: CONNECTION });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, pending.id);
  const wrongTenant = await repo.findByConnection({
    tenantId: OTHER_TENANT,
    channelConnectionId: CONNECTION
  });
  assert.equal(wrongTenant.length, 0);
});

test("findActiveByConnection excludes revoked rows", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  await repo.markRevoked({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id
  });
  const active = await repo.findActiveByConnection({
    tenantId: TENANT,
    channelConnectionId: CONNECTION
  });
  assert.equal(active, null);
});

test("retrieveDecryptedMaterial returns token only for matching tenant", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  const material = await repo.retrieveDecryptedMaterial({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id
  });
  assert.equal(material?.accessToken, "test-instagram-access-token");
  const wrongTenant = await repo.retrieveDecryptedMaterial({
    tenantId: OTHER_TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id
  });
  assert.equal(wrongTenant, null);
});

test("replaceAccessTokenAtomically increments version on success", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  const replaced = await repo.replaceAccessTokenAtomically({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    accessToken: "test-instagram-access-token-refreshed",
    tokenExpiresAt: new Date("2030-06-01T00:00:00.000Z"),
    lastRefreshStatus: "SUCCESS",
    credentialStatus: "ACTIVE"
  });
  assert.equal(replaced.credentialVersion, activated.credentialVersion + 1);
  assert.equal(replaced.lastRefreshStatus, "SUCCESS");
});

test("replaceAccessTokenAtomically rejects stale version", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  await assert.rejects(
    () =>
      repo.replaceAccessTokenAtomically({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: 1,
        accessToken: "test-instagram-access-token-refreshed",
        tokenExpiresAt: new Date("2030-06-01T00:00:00.000Z"),
        lastRefreshStatus: "SUCCESS"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialVersionConflictError
  );
});

test("markReauthRequired transitions active credential", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  const reauth = await repo.markReauthRequired({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    errorCode: "TOKEN_EXPIRED"
  });
  assert.equal(reauth.credentialStatus, "REAUTH_REQUIRED");
  assert.ok(reauth.reauthRequiredAt);
});

test("disconnect transitions from reauth required", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token",
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  await repo.markReauthRequired({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id
  });
  const disconnected = await repo.disconnect({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id
  });
  assert.equal(disconnected.credentialStatus, "DISCONNECTED");
});

test("metadata select omits access_token_ciphertext", async () => {
  let selectColumns = "";
  const repo = new SupabaseInstagramOAuthCredentialRepository(
    {
      from(table: string) {
        if (table !== "instagram_oauth_credentials") throw new Error("unexpected");
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
  await repo.findByConnection({ tenantId: TENANT, channelConnectionId: CONNECTION });
  assert.equal(selectColumns, INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT);
  assert.equal(selectColumns.includes("access_token_ciphertext"), false);
});

test("channel settings public select unchanged by IG-AUTH-2A", () => {
  assert.equal(CHANNEL_CONNECTION_PUBLIC_SELECT.includes("access_token"), false);
  assert.equal(CHANNEL_CREDENTIAL_METADATA_SELECT.includes("encrypted_secret_value"), false);
});

test("not found on wrong connection id", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await assert.rejects(
    () =>
      repo.activate({
        tenantId: TENANT,
        channelConnectionId: "00000000-0000-0000-0000-000000000099",
        credentialId: pending.id,
        accessToken: "test-instagram-access-token",
        tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
        refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
        providerInstagramAccountId: "ig-account-123"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialNotFoundError
  );
});
