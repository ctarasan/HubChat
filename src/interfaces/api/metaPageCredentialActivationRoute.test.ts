import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  assertActivationResponseSafe,
  createMetaPageCredentialVerifyAndActivateHandler
} from "../../../app/api/channel-connect/meta/verify-and-activate/route.js";
import type { MetaPageCredentialActivationOutcome } from "../../application/metaPageCredentialActivation/activateMetaPageCredentialTypes.js";
import type { MetaPageCredentialActivationFailureLogEvent } from "../../lib/metaPageCredentialActivationDiagnostics.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const FB_CONNECTION = "cc111111-1111-4111-8111-111111111111";
const TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";

const adminAuth = {
  tenantId: TENANT,
  role: "ADMIN" as const,
  userId: "auth-user-1",
  email: "admin@test.com",
  salesAgentId: "11111111-1111-4111-8111-111111111111"
};

function buildRequest(input: {
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  roleAuth?: typeof adminAuth | null;
  enabled?: boolean;
}) {
  const headers = new Headers({
    authorization: "Bearer test-token",
    "x-tenant-id": TENANT,
    "content-type": "application/json"
  });
  if (input.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", input.idempotencyKey);
  }

  return new NextRequest("http://localhost/api/channel-connect/meta/verify-and-activate", {
    method: "POST",
    headers,
    body: JSON.stringify(
      input.body ?? {
        accessToken: TOKEN,
        facebookConnectionId: FB_CONNECTION,
        requestedChannels: ["FACEBOOK"],
        expectedCredentialVersion: 0
      }
    )
  });
}

function healthyOutcome(): MetaPageCredentialActivationOutcome {
  return {
    state: "ACTIVATED_HEALTHY_PENDING_CUTOVER",
    activationStatus: "ACTIVATED_PENDING_HEALTH",
    credentialId: "cred-1",
    credentialVersion: 1,
    bindings: [
      {
        channelType: "FACEBOOK",
        channelConnectionId: FB_CONNECTION,
        bindingId: "bind-1",
        credentialVersion: 1
      }
    ],
    idempotencyReplay: false,
    requestedChannels: ["FACEBOOK"]
  };
}

test("route returns 503 when feature flag is OFF before auth", async () => {
  let authCalls = 0;
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => {
      throw new Error("bootstrap should not be called");
    },
    requireAuth: async () => {
      authCalls += 1;
      return adminAuth;
    },
    isEnabled: () => false
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-off" }));
  assert.equal(response.status, 503);
  assert.equal(authCalls, 0);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, "META_ACTIVATION_DISABLED");
});

test("route rejects unauthenticated requests", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    isEnabled: () => true,
    createUseCase: () => ({ execute: async () => healthyOutcome() }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-auth" }));
  assert.equal(response.status, 401);
});

test("route rejects SALES role", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    isEnabled: () => true,
    createUseCase: () => ({ execute: async () => healthyOutcome() }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-sales" }));
  assert.equal(response.status, 403);
});

test("route requires idempotency key before use case", async () => {
  let executeCalls = 0;
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () =>
      ({
        execute: async () => {
          executeCalls += 1;
          return healthyOutcome();
        }
      }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "" }));
  assert.equal(response.status, 400);
  assert.equal(executeCalls, 0);
});

test("route rejects missing access token", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () => ({ execute: async () => healthyOutcome() }) as never
  });

  const response = await handler(
    buildRequest({
      idempotencyKey: "idem-no-token",
      body: {
        accessToken: "",
        facebookConnectionId: FB_CONNECTION,
        requestedChannels: ["FACEBOOK"],
        expectedCredentialVersion: 0
      }
    })
  );
  assert.equal(response.status, 400);
});

test("route returns 200 for healthy activation and omits secrets", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () => ({ execute: async () => healthyOutcome() }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-ok" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assertActivationResponseSafe(body);
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal((body as { data: { state: string } }).data.state, "ACTIVATED_HEALTHY_PENDING_CUTOVER");
});

test("route returns 202 when post-commit health failed", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () =>
      ({
        execute: async () => ({
          ...healthyOutcome(),
          state: "ACTIVATED_HEALTH_FAILED"
        })
      }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-health-fail" }));
  assert.equal(response.status, 202);
  const body = (await response.json()) as { data: { state: string } };
  assert.equal(body.data.state, "ACTIVATED_HEALTH_FAILED");
});

test("route rejects instagram requested without connection", async () => {
  let executeCalls = 0;
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () =>
      ({
        execute: async () => {
          executeCalls += 1;
          return healthyOutcome();
        }
      }) as never
  });

  const response = await handler(
    buildRequest({
      idempotencyKey: "idem-ig-missing",
      body: {
        accessToken: TOKEN,
        facebookConnectionId: FB_CONNECTION,
        requestedChannels: ["FACEBOOK", "INSTAGRAM"],
        expectedCredentialVersion: 0
      }
    })
  );
  assert.equal(response.status, 400);
  assert.equal(executeCalls, 0);
});

test("route maps activation conflict to 409", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () =>
      ({
        execute: async () => {
          const { MetaPageCredentialActivationError } = await import(
            "../../domain/metaPageCredentialActivationErrors.js"
          );
          throw new MetaPageCredentialActivationError(
            "META_ACTIVATION_CONFLICT",
            "conflict",
            false
          );
        }
      }) as never
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-conflict" }));
  assert.equal(response.status, 409);
});

test("authenticated disabled-gate probe returns 503 before auth when flag is OFF", async () => {
  let authCalls = 0;
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => {
      throw new Error("bootstrap should not be called");
    },
    requireAuth: async () => {
      authCalls += 1;
      return adminAuth;
    },
    isEnabled: () => false
  });

  const response = await handler(
    buildRequest({
      idempotencyKey: "gate-probe-auth",
      body: {
        accessToken: "",
        facebookConnectionId: FB_CONNECTION,
        requestedChannels: ["FACEBOOK"],
        expectedCredentialVersion: 0
      }
    })
  );
  assert.equal(response.status, 503);
  assert.equal(authCalls, 0);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, "META_ACTIVATION_DISABLED");
});

test("enabled-route empty-token probe rejects before use case execution", async () => {
  let executeCalls = 0;
  let bootstrapCalls = 0;
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => {
      bootstrapCalls += 1;
      return {} as never;
    },
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    createUseCase: () =>
      ({
        execute: async () => {
          executeCalls += 1;
          return healthyOutcome();
        }
      }) as never
  });

  const response = await handler(
    buildRequest({
      idempotencyKey: "gate-probe-empty",
      body: {
        accessToken: "",
        facebookConnectionId: FB_CONNECTION,
        requestedChannels: ["FACEBOOK"],
        expectedCredentialVersion: 0
      }
    })
  );
  assert.equal(response.status, 400);
  assert.equal(executeCalls, 0);
  assert.equal(bootstrapCalls, 0);
});

function createLoggingHandler(
  input: {
    execute?: () => Promise<MetaPageCredentialActivationOutcome>;
    randomUuid?: () => string;
  } = {}
) {
  const logs: MetaPageCredentialActivationFailureLogEvent[] = [];
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => adminAuth,
    isEnabled: () => true,
    randomUuid: input.randomUuid ?? (() => "corr-route-test-1"),
    logFailure: {
      warn(event) {
        logs.push(event);
      }
    },
    createUseCase: () =>
      ({
        execute: input.execute ?? (async () => healthyOutcome())
      }) as never
  });
  return { handler, logs };
}

test("route failure returns correlationId and safe public contract", async () => {
  const { handler } = createLoggingHandler({
    execute: async () => {
      const { MetaPageCredentialVerificationError } = await import(
        "../../domain/metaPageCredentialVerificationErrors.js"
      );
      throw new MetaPageCredentialVerificationError(
        "META_PAGE_NOT_ACCESSIBLE",
        "raw graph payload must not leak",
        false
      );
    }
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-provider-fail" }));
  assert.equal(response.status, 422);
  const body = (await response.json()) as {
    code?: string;
    message?: string;
    error?: string;
    correlationId?: string;
  };
  assert.equal(body.code, "META_PAGE_NOT_ACCESSIBLE");
  assert.equal(body.message, "Facebook Page is not accessible with the supplied token");
  assert.equal(body.error, body.message);
  assert.equal(body.correlationId, "corr-route-test-1");
  assert.equal(JSON.stringify(body).includes("raw graph payload"), false);
  assertActivationResponseSafe(body);
});

test("route logs structured stage for provider verification failure", async () => {
  const { handler, logs } = createLoggingHandler({
    execute: async () => {
      const { MetaPageCredentialVerificationError } = await import(
        "../../domain/metaPageCredentialVerificationErrors.js"
      );
      throw new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "provider raw", false);
    }
  });

  await handler(buildRequest({ idempotencyKey: "idem-provider-log" }));
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.stage, "PROVIDER_VERIFICATION");
  assert.equal(logs[0]?.sanitizedCode, "META_TOKEN_INVALID");
  assert.equal(logs[0]?.commitReached, false);
  assert.equal(JSON.stringify(logs[0]).includes("provider raw"), false);
  assert.equal(JSON.stringify(logs[0]).includes("Authorization"), false);
});

test("route logs encryption precheck stage with commitReached false", async () => {
  const { handler, logs } = createLoggingHandler({
    execute: async () => {
      const { ChannelCredentialEncryptionError } = await import("../../lib/channelCredentialEncryption.js");
      throw new ChannelCredentialEncryptionError("missing encryption key");
    }
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-encrypt" }));
  assert.equal(response.status, 503);
  assert.equal(logs[0]?.stage, "ENCRYPTION_PRECHECK");
  assert.equal(logs[0]?.commitReached, false);
  assert.equal(logs[0]?.rpcInvoked, false);
});

test("route logs activation RPC conflict with commitReached false", async () => {
  const { handler, logs } = createLoggingHandler({
    execute: async () => {
      const { MetaPageCredentialActivationError } = await import(
        "../../domain/metaPageCredentialActivationErrors.js"
      );
      throw new MetaPageCredentialActivationError(
        "META_ACTIVATION_CONFLICT",
        "rpc insert failed: relation missing",
        false
      );
    }
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-rpc" }));
  assert.equal(response.status, 409);
  assert.equal(logs[0]?.stage, "ACTIVATION_RPC");
  assert.equal(logs[0]?.commitReached, false);
  assert.equal(logs[0]?.rpcInvoked, true);
  const body = (await response.json()) as { message?: string; correlationId?: string };
  assert.equal(body.message?.includes("relation missing"), false);
  assert.equal(body.correlationId, "corr-route-test-1");
  assert.equal(logs[0]?.correlationId, body.correlationId);
});

test("route logs post-commit health failure with commitReached true", async () => {
  const { handler, logs } = createLoggingHandler({
    execute: async () => {
      const { MetaPageCredentialActivationApiError } = await import(
        "../../lib/metaPageCredentialActivationApiErrors.js"
      );
      throw new MetaPageCredentialActivationApiError(
        "META_POST_ACTIVATION_HEALTH_FAILED",
        "decrypt failed internal",
        202,
        false
      );
    }
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-health-fail" }));
  assert.equal(response.status, 202);
  assert.equal(logs[0]?.stage, "POST_COMMIT_HEALTH");
  assert.equal(logs[0]?.commitReached, true);
  assert.equal(logs[0]?.rpcInvoked, true);
  const body = (await response.json()) as { message?: string; correlationId?: string };
  assert.equal(body.message?.includes("decrypt failed internal"), false);
  assert.equal(body.correlationId, "corr-route-test-1");
  assert.equal(logs[0]?.correlationId, body.correlationId);
});

test("route authorization failure keeps commitReached and rpcInvoked false", async () => {
  const { handler, logs } = createLoggingHandler({
    execute: async () => {
      throw new Error("Unauthorized");
    }
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-auth-log" }));
  assert.equal(response.status, 401);
  assert.equal(logs[0]?.stage, "AUTHORIZATION");
  assert.equal(logs[0]?.commitReached, false);
  assert.equal(logs[0]?.rpcInvoked, false);
});

test("route generates unique correlationId per request", async () => {
  let n = 0;
  const { handler } = createLoggingHandler({
    randomUuid: () => `corr-${++n}`,
    execute: async () => {
      throw new Error("Unauthorized");
    }
  });

  const first = await handler(buildRequest({ idempotencyKey: "idem-corr-1" }));
  const second = await handler(buildRequest({ idempotencyKey: "idem-corr-2" }));
  const firstBody = (await first.json()) as { correlationId?: string };
  const secondBody = (await second.json()) as { correlationId?: string };
  assert.equal(firstBody.correlationId, "corr-1");
  assert.equal(secondBody.correlationId, "corr-2");
});

test("disabled gate failure still returns correlationId", async () => {
  const handler = createMetaPageCredentialVerifyAndActivateHandler({
    apiBootstrap: () => {
      throw new Error("bootstrap should not be called");
    },
    requireAuth: async () => adminAuth,
    isEnabled: () => false,
    randomUuid: () => "corr-disabled-1"
  });

  const response = await handler(buildRequest({ idempotencyKey: "idem-disabled-corr" }));
  const body = (await response.json()) as { code?: string; correlationId?: string };
  assert.equal(body.code, "META_ACTIVATION_DISABLED");
  assert.equal(body.correlationId, "corr-disabled-1");
});
