import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";
import { SupabaseChannelSettingRepository } from "../../infrastructure/adapters/repositories/supabaseChannelSettingRepository.js";
import { createInstagramOutboundAdapterResolver } from "./createInstagramOutboundAdapterResolver.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function fakePageAccessToken(suffix: string): string {
  return `EA${suffix.repeat(78)}`;
}

function makeRepositoryWithRuntime(runtime: ChannelRuntimeConfig | null) {
  let getRuntimeConfigCalls = 0;
  const supabase = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, _val2: string) => ({
            maybeSingle: async () => ({
              data:
                runtime == null
                  ? null
                  : {
                      id: "cs-1",
                      tenant_id: runtime.tenantId,
                      channel: "INSTAGRAM",
                      enabled: runtime.enabled,
                      display_name: null,
                      config_json: { providerPageId: runtime.providerPageId },
                      secret_fingerprint_json: {
                        accessToken: "fp",
                        appSecret: "fp",
                        verifyToken: "fp"
                      },
                      secret_json: {
                        accessToken: runtime.secrets.accessToken,
                        appSecret: runtime.secrets.appSecret,
                        verifyToken: runtime.secrets.verifyToken
                      },
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    },
              error: null
            })
          })
        })
      })
    })
  } as any;

  const repository = new SupabaseChannelSettingRepository(supabase);
  const originalGetRuntimeConfig = repository.getRuntimeConfig.bind(repository);
  repository.getRuntimeConfig = async (input) => {
    getRuntimeConfigCalls += 1;
    return originalGetRuntimeConfig(input);
  };

  return { repository, getRuntimeConfigCalls: () => getRuntimeConfigCalls };
}

test("unbound repository.getRuntimeConfig loses repository instance binding", async () => {
  const repository = new SupabaseChannelSettingRepository({
    from: () => {
      throw new Error("supabase should not be reached when this is unbound");
    }
  } as any);
  const detached = repository.getRuntimeConfig;
  await assert.rejects(
    () => detached({ tenantId: TENANT_ID, channel: "INSTAGRAM" }),
    (err: Error) => err.message.includes("supabase") || err.message.includes("findInternal")
  );
});

test("Instagram resolver DB_WITH_ENV_FALLBACK calls repository with bound this", async () => {
  const dbRuntime: ChannelRuntimeConfig = {
    tenantId: TENANT_ID,
    channel: "INSTAGRAM",
    enabled: true,
    providerPageId: "db-page-id",
    providerAccountName: null,
    secrets: {
      accessToken: fakePageAccessToken("D"),
      appSecret: "secret",
      verifyToken: "verify"
    }
  };
  const { repository, getRuntimeConfigCalls } = makeRepositoryWithRuntime(dbRuntime);

  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: {
      FACEBOOK_PAGE_ACCESS_TOKEN: fakePageAccessToken("E"),
      FACEBOOK_PAGE_ID: "env-page-id"
    },
    channelSettingRepository: repository
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("graph.facebook.com")) {
      return new Response(JSON.stringify({ message_id: "ig-mid-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const adapter = await resolver.resolve(TENANT_ID);
    assert.equal(adapter.channel, "INSTAGRAM");
    assert.equal(getRuntimeConfigCalls(), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram resolver DB_ONLY missing DB config fails safely without supabase TypeError", async () => {
  const { repository } = makeRepositoryWithRuntime(null);
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_ONLY",
    env: {
      FACEBOOK_PAGE_ACCESS_TOKEN: fakePageAccessToken("E"),
      FACEBOOK_PAGE_ID: "env-page-id"
    },
    channelSettingRepository: repository
  });

  await assert.rejects(
    () => resolver.resolve(TENANT_ID),
    (err: Error) => {
      assert.equal(err.message.includes("supabase"), false);
      assert.equal(err.message.includes(fakePageAccessToken("E")), false);
      assert.match(err.message, /not configured|unavailable/i);
      return true;
    }
  );
});

test("Instagram resolver DB_WITH_ENV_FALLBACK falls back to env when DB runtime missing", async () => {
  const { repository } = makeRepositoryWithRuntime(null);
  const envToken = fakePageAccessToken("E");
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: {
      FACEBOOK_PAGE_ACCESS_TOKEN: envToken,
      FACEBOOK_PAGE_ID: "env-page-id"
    },
    channelSettingRepository: repository
  });

  let accessToken: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("graph.facebook.com")) {
      accessToken = parsed.searchParams.get("access_token");
      return new Response(JSON.stringify({ message_id: "ig-mid-2" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const adapter = await resolver.resolve(TENANT_ID);
    await adapter.sendMessage({
      channelThreadId: "ig:user:959986016929726",
      content: "hello",
      idempotencyKey: "retry-key-1",
      messageType: "TEXT"
    });
    assert.equal(accessToken, envToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
