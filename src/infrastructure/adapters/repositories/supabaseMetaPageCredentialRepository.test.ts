import test from "node:test";
import assert from "node:assert/strict";
import { META_PAGE_BINDING_METADATA_SELECT } from "../../../lib/metaPageCredentialPublicDto.js";
import {
  MetaPageCredentialBindingConflictError,
  MetaPageCredentialDecryptionFailedError,
  MetaPageCredentialEncryptionUnavailableError,
  MetaPageCredentialFamilyMismatchError,
  MetaPageCredentialInactiveError,
  MetaPageCredentialNotFoundError,
  MetaPageCredentialTokenShapeError,
  MetaPageCredentialVersionConflictError
} from "../../../domain/metaPageCredentialErrors.js";
import { SupabaseMetaPageCredentialRepository } from "./supabaseMetaPageCredentialRepository.js";

const TEST_KEY = "0123456789abcdef".repeat(4);
const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "da92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const FB_CONNECTION = "cc111111-1111-4111-8111-111111111111";
const IG_CONNECTION = "cc222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function buildRepository(options?: {
  connections?: Row[];
}) {
  const credentials: Row[] = [];
  const bindings: Row[] = [];
  const connections: Row[] = options?.connections ?? [
    { id: FB_CONNECTION, tenant_id: TENANT, provider: "FACEBOOK" },
    { id: IG_CONNECTION, tenant_id: TENANT, provider: "INSTAGRAM" }
  ];

  const queryBuilder = (
    table: "meta_page_credentials" | "meta_page_credential_bindings" | "channel_connections"
  ) => {
    let filters: Array<[string, unknown]> = [];
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let versionEq: number | null = null;
    let statusEq: string | null = null;
    let orderAsc = false;
    let failNextInsert = false;

    const rows = () => {
      if (table === "meta_page_credentials") return credentials;
      if (table === "meta_page_credential_bindings") return bindings;
      return connections;
    };
    const match = (row: Row) => filters.every(([column, value]) => row[column] === value);

    const applyUpdate = (found: Row) => {
      if (versionEq !== null && found.credential_version !== versionEq) return false;
      if (statusEq !== null && found.status !== statusEq) return false;
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
        } else if (column === "status" && typeof value === "string") {
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
        if (pendingInsert) {
          if (failNextInsert) {
            pendingInsert = null;
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          const id = crypto.randomUUID();
          const stored = {
            id,
            credential_version: 1,
            status: "ACTIVE",
            encryption_format_version: "v1",
            key_version: 1,
            ...pendingInsert
          };
          if (table === "meta_page_credentials") credentials.push(stored);
          else bindings.push(stored);
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
      },
      __failNextInsert() {
        failNextInsert = true;
      }
    };

    return builder;
  };

  const client = {
    from(table: string) {
      if (
        table === "meta_page_credentials" ||
        table === "meta_page_credential_bindings" ||
        table === "channel_connections"
      ) {
        return queryBuilder(table);
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, credentials, bindings, connections };
}

async function createActiveCredential(
  repo: SupabaseMetaPageCredentialRepository,
  options?: { instagramProfessionalAccountId?: string | null }
) {
  return repo.createVerifiedCredential({
    tenantId: TENANT,
    credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
    providerAppId: "1234567890",
    facebookPageId: "9876543210",
    instagramProfessionalAccountId: options?.instagramProfessionalAccountId ?? null,
    accessToken: "EAAfake-page-access-token-placeholder",
    verifiedAt: new Date("2026-06-23T00:00:00.000Z")
  });
}

test("createVerifiedCredential encrypts token and returns metadata without plaintext", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const created = await createActiveCredential(repo);
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.credentialVersion, 1);
  assert.equal(created.credentialFamily, "META_PAGE_FACEBOOK_LOGIN");
  const stored = credentials[0];
  assert.equal(typeof stored?.encrypted_access_token, "string");
  assert.equal(
    String(stored?.encrypted_access_token).includes("EAAfake-page-access-token-placeholder"),
    false
  );
  assert.ok(typeof created.tokenFingerprint === "string" && created.tokenFingerprint.length > 0);
});

test("createVerifiedCredential rejects unsupported credential family", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  await assert.rejects(
    () =>
      repo.createVerifiedCredential({
        tenantId: TENANT,
        credentialFamily: "INSTAGRAM_BUSINESS_LOGIN" as "META_PAGE_FACEBOOK_LOGIN",
        providerAppId: "1234567890",
        facebookPageId: "9876543210",
        accessToken: "EAAfake-page-access-token-placeholder",
        verifiedAt: new Date("2026-06-23T00:00:00.000Z")
      }),
    (err: unknown) => err instanceof MetaPageCredentialFamilyMismatchError
  );
});

test("createVerifiedCredential rejects IGA token shape", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  await assert.rejects(
    () =>
      repo.createVerifiedCredential({
        tenantId: TENANT,
        credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
        providerAppId: "1234567890",
        facebookPageId: "9876543210",
        accessToken: "IGARVfake-instagram-login-token",
        verifiedAt: new Date("2026-06-23T00:00:00.000Z")
      }),
    (err: unknown) => err instanceof MetaPageCredentialTokenShapeError
  );
});

test("createVerifiedCredential fails closed when encryption key is missing", async () => {
  const { client } = buildRepository();
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  try {
    const repo = new SupabaseMetaPageCredentialRepository(client as any, null);
    await assert.rejects(
      () =>
        repo.createVerifiedCredential({
          tenantId: TENANT,
          credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
          providerAppId: "1234567890",
          facebookPageId: "9876543210",
          accessToken: "EAAfake-page-access-token-placeholder",
          verifiedAt: new Date("2026-06-23T00:00:00.000Z")
        }),
      (err: unknown) => err instanceof MetaPageCredentialEncryptionUnavailableError
    );
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("getCredentialById is tenant scoped", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const created = await createActiveCredential(repo);
  const found = await repo.getCredentialById({ tenantId: TENANT, credentialId: created.id });
  assert.equal(found?.id, created.id);
  const crossTenant = await repo.getCredentialById({
    tenantId: OTHER_TENANT,
    credentialId: created.id
  });
  assert.equal(crossTenant, null);
});

test("bindChannelConnection creates active binding with matching credential version", async () => {
  const { client, bindings } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const binding = await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  assert.equal(binding.bindingStatus, "ACTIVE");
  assert.equal(binding.credentialVersion, credential.credentialVersion);
  assert.equal(bindings.length, 1);
});

test("bindChannelConnection is idempotent for duplicate retry", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const first = await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  const second = await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  assert.equal(second.id, first.id);
});

test("bindChannelConnection rejects duplicate active binding for different credential", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const first = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: first.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: first.credentialVersion
  });

  credentials.push({
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    credential_family: "META_PAGE_FACEBOOK_LOGIN",
    provider_app_id: "1234567890",
    facebook_page_id: "1111111111",
    encrypted_access_token: "v1:a:b:c",
    token_fingerprint: "abc",
    encryption_format_version: "v1",
    key_version: 1,
    credential_version: 1,
    status: "ACTIVE",
    verified_at: new Date().toISOString()
  });
  const secondId = String(credentials[1].id);

  await assert.rejects(
    () =>
      repo.bindChannelConnection({
        tenantId: TENANT,
        credentialId: secondId,
        channelConnectionId: FB_CONNECTION,
        channelType: "FACEBOOK",
        expectedCredentialVersion: 1
      }),
    (err: unknown) => err instanceof MetaPageCredentialBindingConflictError
  );
});

test("bindChannelConnection rejects revoked credential", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.revokeCredential({
    tenantId: TENANT,
    credentialId: credential.id,
    expectedCredentialVersion: credential.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  await assert.rejects(
    () =>
      repo.bindChannelConnection({
        tenantId: TENANT,
        credentialId: credential.id,
        channelConnectionId: FB_CONNECTION,
        channelType: "FACEBOOK",
        expectedCredentialVersion: 2
      }),
    (err: unknown) => err instanceof MetaPageCredentialInactiveError
  );
});

test("bindChannelConnection requires instagram_professional_account_id for Instagram channel", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await assert.rejects(
    () =>
      repo.bindChannelConnection({
        tenantId: TENANT,
        credentialId: credential.id,
        channelConnectionId: IG_CONNECTION,
        channelType: "INSTAGRAM",
        expectedCredentialVersion: credential.credentialVersion
      }),
    (err: unknown) => err instanceof MetaPageCredentialBindingConflictError
  );
});

test("bindChannelConnection rejects cross-tenant credential lookup", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await assert.rejects(
    () =>
      repo.bindChannelConnection({
        tenantId: OTHER_TENANT,
        credentialId: credential.id,
        channelConnectionId: FB_CONNECTION,
        channelType: "FACEBOOK",
        expectedCredentialVersion: credential.credentialVersion
      }),
    (err: unknown) => err instanceof MetaPageCredentialNotFoundError
  );
});

test("rotateCredentialWithExpectedVersion increments version", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const rotated = await repo.rotateCredentialWithExpectedVersion({
    tenantId: TENANT,
    credentialId: credential.id,
    accessToken: "EAAfake-page-access-token-rotated",
    expectedCredentialVersion: credential.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  assert.equal(rotated.credentialVersion, credential.credentialVersion + 1);
});

test("rotateCredentialWithExpectedVersion rejects stale version with no mutation", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const beforeFingerprint = credential.tokenFingerprint;
  await assert.rejects(
    () =>
      repo.rotateCredentialWithExpectedVersion({
        tenantId: TENANT,
        credentialId: credential.id,
        accessToken: "EAAfake-page-access-token-rotated",
        expectedCredentialVersion: 2,
        expectedCurrentStatus: "ACTIVE"
      }),
    (err: unknown) => err instanceof MetaPageCredentialVersionConflictError
  );
  const stored = credentials[0];
  assert.equal(stored?.credential_version, 1);
  assert.equal(stored?.token_fingerprint, beforeFingerprint);
});

test("getActiveCredentialForBinding returns credential when binding version matches", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  const resolved = await repo.getActiveCredentialForBinding({
    tenantId: TENANT,
    channelConnectionId: FB_CONNECTION
  });
  assert.ok(resolved);
  assert.equal(resolved?.credential.id, credential.id);
  assert.equal(resolved?.binding.channelType, "FACEBOOK");
});

test("getActiveCredentialForBinding returns null when binding is missing", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const resolved = await repo.getActiveCredentialForBinding({
    tenantId: TENANT,
    channelConnectionId: FB_CONNECTION
  });
  assert.equal(resolved, null);
});

test("getActiveCredentialForBinding isolates Facebook binding from Instagram connection lookup", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  const instagramLookup = await repo.getActiveCredentialForBinding({
    tenantId: TENANT,
    channelConnectionId: IG_CONNECTION
  });
  assert.equal(instagramLookup, null);
});

test("getActiveCredentialForBinding returns null when credential version drifts from binding", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  await repo.rotateCredentialWithExpectedVersion({
    tenantId: TENANT,
    credentialId: credential.id,
    accessToken: "EAAfake-page-access-token-rotated",
    expectedCredentialVersion: credential.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  const resolved = await repo.getActiveCredentialForBinding({
    tenantId: TENANT,
    channelConnectionId: FB_CONNECTION
  });
  assert.equal(resolved, null);
});

test("getActiveCredentialForBinding returns null after revoke", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  await repo.revokeCredential({
    tenantId: TENANT,
    credentialId: credential.id,
    expectedCredentialVersion: credential.credentialVersion,
    expectedCurrentStatus: "ACTIVE"
  });
  const resolved = await repo.getActiveCredentialForBinding({
    tenantId: TENANT,
    channelConnectionId: FB_CONNECTION
  });
  assert.equal(resolved, null);
});

test("retrieveDecryptedMaterial round-trips encrypted token", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const material = await repo.retrieveDecryptedMaterial({
    tenantId: TENANT,
    credentialId: credential.id
  });
  assert.equal(material?.accessToken, "EAAfake-page-access-token-placeholder");
});

test("retrieveDecryptedMaterial fails closed on tampered ciphertext", async () => {
  const { client, credentials } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  credentials[0].encrypted_access_token = "v1:deadbeef:deadbeef:deadbeef";
  await assert.rejects(
    () =>
      repo.retrieveDecryptedMaterial({
        tenantId: TENANT,
        credentialId: credential.id
      }),
    (err: unknown) => err instanceof MetaPageCredentialDecryptionFailedError
  );
});

test("retrieveDecryptedMaterial fails closed with wrong encryption key", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  const wrongKeyRepo = new SupabaseMetaPageCredentialRepository(
    client as any,
    "fedcba9876543210".repeat(4)
  );
  await assert.rejects(
    () =>
      wrongKeyRepo.retrieveDecryptedMaterial({
        tenantId: TENANT,
        credentialId: credential.id
      }),
    (err: unknown) => err instanceof MetaPageCredentialDecryptionFailedError
  );
});

test("listBindingsForCredential rejects missing credential", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  await assert.rejects(
    () =>
      repo.listBindingsForCredential({
        tenantId: TENANT,
        credentialId: crypto.randomUUID()
      }),
    (err: unknown) => err instanceof MetaPageCredentialNotFoundError
  );
});

test("listBindingsForChannelConnection returns bindings for connection", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo);
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  const bindings = await repo.listBindingsForChannelConnection({
    tenantId: TENANT,
    channelConnectionId: FB_CONNECTION
  });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0]?.channelType, "FACEBOOK");
});

test("listBindingsForCredential returns bindings for credential", async () => {
  const { client } = buildRepository();
  const repo = new SupabaseMetaPageCredentialRepository(client as any, TEST_KEY);
  const credential = await createActiveCredential(repo, {
    instagramProfessionalAccountId: "17841400000000000"
  });
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: FB_CONNECTION,
    channelType: "FACEBOOK",
    expectedCredentialVersion: credential.credentialVersion
  });
  await repo.bindChannelConnection({
    tenantId: TENANT,
    credentialId: credential.id,
    channelConnectionId: IG_CONNECTION,
    channelType: "INSTAGRAM",
    expectedCredentialVersion: credential.credentialVersion
  });
  const bindings = await repo.listBindingsForCredential({
    tenantId: TENANT,
    credentialId: credential.id
  });
  assert.equal(bindings.length, 2);
  assert.deepEqual(
    bindings.map((b) => b.channelType).sort(),
    ["FACEBOOK", "INSTAGRAM"]
  );
});

test("metadata select excludes encrypted_access_token", () => {
  assert.equal(META_PAGE_BINDING_METADATA_SELECT.includes("encrypted_access_token"), false);
});
