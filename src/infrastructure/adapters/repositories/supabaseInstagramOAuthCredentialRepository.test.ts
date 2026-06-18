import test from "node:test";
import assert from "node:assert/strict";
import { ChannelCredentialEncryptionError } from "../../../lib/channelCredentialEncryption.js";
import { CHANNEL_CONNECTION_PUBLIC_SELECT } from "../../../lib/channelConnectionPublicDto.js";
import { CHANNEL_CREDENTIAL_METADATA_SELECT } from "../../../lib/channelConnectionPublicDto.js";
import { InstagramOAuthCredentialTransitionError } from "../../../lib/instagramOAuthCredentialLifecycle.js";
import { INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT } from "../../../lib/instagramOAuthCredentialPublicDto.js";
import {
  InstagramOAuthCredentialConnectionNotFoundError,
  InstagramOAuthCredentialNotFoundError,
  InstagramOAuthCredentialVersionConflictError,
  SupabaseInstagramOAuthCredentialRepository
} from "./supabaseInstagramOAuthCredentialRepository.js";

const TEST_KEY = "0123456789abcdef".repeat(4);
const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "da92d847-53cd-4b60-9e4d-5fd3f8ad8650";

type Row = Record<string, unknown>;

function buildRepository(options?: { connections?: Row[] }) {
  const credentials: Row[] = [];
  const connections: Row[] = options?.connections ?? [
    { id: CONNECTION, tenant_id: TENANT, provider: "INSTAGRAM" }
  ];

  const queryBuilder = (table: "instagram_oauth_credentials" | "channel_connections") => {
    let filters: Array<[string, unknown]> = [];
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let versionEq: number | null = null;
    let statusEq: string | null = null;
    let orderAsc = false;
    let useMaybeSingle = false;

    const rows = () => (table === "instagram_oauth_credentials" ? credentials : connections);
    const match = (row: Row) => filters.every(([column, value]) => row[column] === value);

    const applyUpdate = (found: Row) => {
      if (versionEq !== null && found.credential_version !== versionEq) return false;
      if (statusEq !== null && found.credential_status !== statusEq) return false;
      Object.assign(found, pendingUpdate, {
        credential_version:
          pendingUpdate?.credential_version ??
          (versionEq !== null ? versionEq + 1 : found.credential_version)
      });
      return true;
    };

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
        } else if (column === "credential_status" && typeof value === "string") {
          statusEq = value;
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
        useMaybeSingle = true;
        if (pendingInsert) {
          const id = crypto.randomUUID();
          const stored = {
            id,
            credential_version: 1,
            credential_status: "PENDING",
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
        if (pendingUpdate) {
          const found = rows().find((row) => match(row));
          if (!found || !applyUpdate(found)) {
            return { data: null, error: null };
          }
          const result = { ...found };
          pendingUpdate = null;
          versionEq = null;
          statusEq = null;
          filters = [];
          return { data: result, error: null };
        }
        const found = rows().find((row) => match(row)) ?? null;
        return { data: found, error: null };
      },
      single: async () => {
        if (pendingInsert) {
          return builder.maybeSingle();
        }
        if (pendingUpdate) {
          const found = rows().find((row) => match(row));
          if (!found || !applyUpdate(found)) {
            return {
              data: null,
              error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }
            };
          }
          const result = { ...found };
          pendingUpdate = null;
          versionEq = null;
          statusEq = null;
          filters = [];
          return { data: result, error: null };
        }
        const found = rows().find((row) => match(row));
        if (!found) {
          return {
            data: null,
            error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }
          };
        }
        return { data: found, error: null };
      },
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const matched = rows()
          .filter((row) => match(row))
          .sort((a, b) => {
            const aTime = String(a.created_at ?? "");
            const bTime = String(b.created_at ?? "");
            return orderAsc ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime);
          });
        resolve({ data: matched, error: null });
        return Promise.resolve();
      }
    };

    return builder;
  };

  const client = {
    from(table: string) {
      if (table === "instagram_oauth_credentials" || table === "channel_connections") {
        return queryBuilder(table);
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, credentials, connections };
}

async function activateCredential(
  repo: SupabaseInstagramOAuthCredentialRepository,
  pendingId: string,
  token = "test-instagram-access-token"
) {
  return repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pendingId,
    accessToken: token,
    tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123",
    providerUserId: "meta-user-456"
  });
}

test("createPending validates tenant-owned connection", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const created = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  assert.equal(created.credentialStatus, "PENDING");
});

test("createPending rejects connection outside tenant scope", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  await assert.rejects(
    () =>
      repo.createPending({
        tenantId: OTHER_TENANT,
        channelConnectionId: CONNECTION,
        authFamily: "INSTAGRAM_BUSINESS_LOGIN"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialConnectionNotFoundError
  );
  assert.equal(
    String(new InstagramOAuthCredentialConnectionNotFoundError("x")).includes(OTHER_TENANT),
    false
  );
});

test("activate encrypts token and returns metadata without plaintext", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  assert.equal(activated.credentialStatus, "ACTIVE");
  assert.equal(activated.credentialVersion, 2);
  const stored = credentials.find((row) => row.id === pending.id);
  assert.equal(typeof stored?.access_token_ciphertext, "string");
  assert.equal(String(stored?.access_token_ciphertext).includes("test-instagram-access-token"), false);
});

test("activate rejects blank token", async () => {
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
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        accessToken: "   ",
        tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
        refreshEligibleAt: new Date("2026-06-20T00:00:00.000Z"),
        providerInstagramAccountId: "ig-account-123"
      }),
    (err: unknown) => err instanceof ChannelCredentialEncryptionError
  );
});

test("activate zero-row update returns version conflict not PostgREST error", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await assert.rejects(
    () =>
      repo.updateLifecycle({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: 99,
        expectedCurrentStatus: "PENDING",
        credentialStatus: "ERROR"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialVersionConflictError
  );
});

test("reauth activation succeeds from REAUTH_REQUIRED with encrypted token", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const reauth = await repo.markReauthRequired({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  const renewed = await repo.activate({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    accessToken: "test-instagram-access-token-renewed",
    tokenExpiresAt: new Date("2030-02-01T00:00:00.000Z"),
    refreshEligibleAt: new Date("2026-06-21T00:00:00.000Z"),
    providerInstagramAccountId: "ig-account-123"
  });
  assert.equal(renewed.credentialStatus, "ACTIVE");
  assert.equal(renewed.credentialVersion, reauth.credentialVersion + 1);
});

test("replaceAccessTokenAtomically increments version on success", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const replaced = await repo.replaceAccessTokenAtomically({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE",
    accessToken: "test-instagram-access-token-refreshed",
    tokenExpiresAt: new Date("2030-06-01T00:00:00.000Z"),
    lastRefreshStatus: "SUCCESS",
    credentialStatus: "ACTIVE"
  });
  assert.equal(replaced.credentialVersion, activated.credentialVersion + 1);
});

test("replaceAccessTokenAtomically rejects stale version", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await activateCredential(repo, pending.id);
  await assert.rejects(
    () =>
      repo.replaceAccessTokenAtomically({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: 1,
        expectedCurrentStatus: "ACTIVE",
        accessToken: "test-instagram-access-token-refreshed",
        tokenExpiresAt: new Date("2030-06-01T00:00:00.000Z"),
        lastRefreshStatus: "SUCCESS"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialVersionConflictError
  );
});

test("stale writer cannot restore ACTIVE after disconnect", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const staleVersion = activated.credentialVersion;
  await repo.disconnect({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  await assert.rejects(
    () =>
      repo.replaceAccessTokenAtomically({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: staleVersion,
        expectedCurrentStatus: "ACTIVE",
        accessToken: "test-instagram-access-token-refreshed",
        tokenExpiresAt: new Date("2030-06-01T00:00:00.000Z"),
        lastRefreshStatus: "SUCCESS"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialVersionConflictError
  );
  assert.equal(credentials[0]?.credential_status, "DISCONNECTED");
});

test("stale writer cannot restore ACTIVE after revoke", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const staleVersion = activated.credentialVersion;
  await repo.markRevoked({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  await assert.rejects(
    () =>
      repo.updateLifecycle({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: staleVersion,
        expectedCurrentStatus: "ACTIVE",
        credentialStatus: "TOKEN_EXPIRING"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialVersionConflictError
  );
});

test("generic lifecycle cannot set ACTIVE", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  await assert.rejects(
    () =>
      repo.updateLifecycle({
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: pending.id,
        expectedCredentialVersion: 1,
        expectedCurrentStatus: "PENDING",
        credentialStatus: "ACTIVE"
      }),
    (err: unknown) => err instanceof InstagramOAuthCredentialTransitionError
  );
});

test("markReauthRequired uses version guard", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const reauth = await repo.markReauthRequired({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE",
    errorCode: "TOKEN_EXPIRED"
  });
  assert.equal(reauth.credentialStatus, "REAUTH_REQUIRED");
});

test("disconnect transitions from reauth required with version guard", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  const reauth = await repo.markReauthRequired({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  const disconnected = await repo.disconnect({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: reauth.credentialVersion,
    expectedCurrentStatus: "REAUTH_REQUIRED"
  });
  assert.equal(disconnected.credentialStatus, "DISCONNECTED");
});

test("findActiveByConnection excludes revoked rows", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  await repo.markRevoked({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: pending.id,
    expectedCredentialVersion: activated.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
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
  await activateCredential(repo, pending.id);
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

test("not found on wrong connection id during activate", async () => {
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

test("version conflict error does not include token material", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseInstagramOAuthCredentialRepository(client as any, TEST_KEY);
  const pending = await repo.createPending({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    authFamily: "INSTAGRAM_BUSINESS_LOGIN"
  });
  const activated = await activateCredential(repo, pending.id);
  try {
    await repo.updateLifecycle({
      tenantId: TENANT,
      channelConnectionId: CONNECTION,
      credentialId: pending.id,
      expectedCredentialVersion: activated.credentialVersion - 1,
      expectedCurrentStatus: "ACTIVE",
      credentialStatus: "TOKEN_EXPIRING"
    });
    assert.fail("expected version conflict");
  } catch (err) {
    assert.ok(err instanceof InstagramOAuthCredentialVersionConflictError);
    assert.equal(String(err).includes("test-instagram-access-token"), false);
    assert.equal(String(err).includes("ciphertext"), false);
  }
});
