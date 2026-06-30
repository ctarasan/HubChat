import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createActivateMetaPageCredentialUseCaseFromBootstrap } from "../../../../../src/interfaces/api/metaPageCredentialActivationRouteFactory.js";
import {
  assertMetaPageCredentialActivationBodySize,
  parseMetaPageCredentialActivationBody,
  parseMetaPageCredentialActivationIdempotencyKey,
  validateMetaPageCredentialActivationContract
} from "../../../../../src/application/metaPageCredentialActivation/parseMetaPageCredentialActivationApiRequest.js";
import {
  mapMetaPageCredentialActivationFailure,
  MetaPageCredentialActivationApiError
} from "../../../../../src/lib/metaPageCredentialActivationApiErrors.js";
import { isMetaPageCredentialActivationApiEnabled } from "../../../../../src/lib/metaPageCredentialActivationApiFlags.js";
import {
  buildMetaPageCredentialActivationFailureLogEvent,
  buildPublicActivationErrorJson,
  createActivationCorrelationId,
  createActivationExecutionState,
  inferMetaPageCredentialActivationStage,
  logMetaPageCredentialActivationFailure,
  resolveActivationFailurePersistence,
  type MetaPageCredentialActivationExecutionState,
  type MetaPageCredentialActivationFailureLogger,
  type MetaPageCredentialActivationRequestContext
} from "../../../../../src/lib/metaPageCredentialActivationDiagnostics.js";

export type MetaPageCredentialVerifyAndActivateRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
  isEnabled?: typeof isMetaPageCredentialActivationApiEnabled;
  createUseCase?: typeof createActivateMetaPageCredentialUseCaseFromBootstrap;
  randomUuid?: () => string;
  logFailure?: MetaPageCredentialActivationFailureLogger;
};

function activationHttpStatus(state: string): number {
  if (state === "ACTIVATED_HEALTHY_PENDING_CUTOVER") return 200;
  return 202;
}

function toPublicActivationResponse(outcome: {
  state: string;
  activationStatus: string;
  credentialId: string;
  credentialVersion: number;
  bindings: Array<{
    channelType: string;
    channelConnectionId: string;
    bindingId: string;
    credentialVersion: number;
  }>;
  idempotencyReplay: boolean;
  requestedChannels: string[];
}) {
  return {
    data: {
      state: outcome.state,
      activationStatus: outcome.activationStatus,
      credentialId: outcome.credentialId,
      credentialVersion: outcome.credentialVersion,
      bindings: outcome.bindings.map((binding) => ({
        channelType: binding.channelType,
        channelConnectionId: binding.channelConnectionId,
        bindingId: binding.bindingId,
        credentialVersion: binding.credentialVersion
      })),
      idempotencyReplay: outcome.idempotencyReplay,
      requestedChannels: outcome.requestedChannels
    }
  };
}

function defaultRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

function defaultFailureLogger(): MetaPageCredentialActivationFailureLogger {
  return {
    warn(payload, message) {
      console.warn(message, JSON.stringify(payload));
    }
  };
}

function activationFailureResponse(
  error: unknown,
  correlationId: string,
  context: MetaPageCredentialActivationRequestContext,
  deps: MetaPageCredentialVerifyAndActivateRouteDeps,
  execution: MetaPageCredentialActivationExecutionState = createActivationExecutionState()
): Response {
  const persistence = resolveActivationFailurePersistence(error, execution);
  const mapped = mapMetaPageCredentialActivationFailure(error);
  const stage = inferMetaPageCredentialActivationStage(error, mapped);
  const logEvent = buildMetaPageCredentialActivationFailureLogEvent({
    correlationId,
    stage,
    sanitizedCode: mapped.code,
    httpStatus: mapped.httpStatus,
    context,
    commitReached: persistence.commitReached,
    rpcInvoked: persistence.rpcInvoked
  });
  logMetaPageCredentialActivationFailure(deps.logFailure ?? defaultFailureLogger(), logEvent);
  const body = buildPublicActivationErrorJson(mapped, correlationId);
  assertActivationResponseSafe(body);
  return NextResponse.json(body, { status: mapped.httpStatus });
}

export function createMetaPageCredentialVerifyAndActivateHandler(
  deps: MetaPageCredentialVerifyAndActivateRouteDeps = {
    apiBootstrap,
    requireAuth
  }
) {
  const isEnabled = deps.isEnabled ?? isMetaPageCredentialActivationApiEnabled;
  const createUseCase =
    deps.createUseCase ??
    ((bootstrap) => createActivateMetaPageCredentialUseCaseFromBootstrap(bootstrap));
  const randomUuid = deps.randomUuid ?? defaultRandomUuid;

  return async function POST(req: NextRequest) {
    const correlationId = createActivationCorrelationId(randomUuid);
    const context: MetaPageCredentialActivationRequestContext = {};
    const execution = createActivationExecutionState();

    try {
      if (!isEnabled()) {
        return activationFailureResponse(
          new MetaPageCredentialActivationApiError(
            "META_ACTIVATION_DISABLED",
            "Meta Page credential activation is not available",
            503,
            false
          ),
          correlationId,
          context,
          deps
        );
      }

      assertMetaPageCredentialActivationBodySize(req.headers.get("content-length"));

      const auth = await deps.requireAuth(req, ["ADMIN"]);
      context.tenantId = auth.tenantId;
      const idempotencyKey = parseMetaPageCredentialActivationIdempotencyKey(
        req.headers.get("Idempotency-Key")
      );

      const rawBody = await req.json().catch(() => {
        throw new MetaPageCredentialActivationApiError(
          "META_ACTIVATION_INPUT_INVALID",
          "Activation request body is invalid",
          400,
          false
        );
      });

      const body = parseMetaPageCredentialActivationBody(rawBody);
      context.facebookConnectionId = body.facebookConnectionId;
      context.expectedCredentialVersion = body.expectedCredentialVersion;
      const { requestedChannels, instagramConnectionId } =
        validateMetaPageCredentialActivationContract(body);
      context.requestedChannels = [...requestedChannels];

      const bootstrap = deps.apiBootstrap();
      const useCase = createUseCase(bootstrap);
      const outcome = await useCase.execute({
        tenantId: auth.tenantId,
        actorSalesAgentId: auth.salesAgentId,
        accessToken: body.accessToken,
        facebookConnectionId: body.facebookConnectionId,
        instagramConnectionId,
        requestedChannels,
        expectedCredentialVersion: body.expectedCredentialVersion,
        credentialId: body.credentialId ?? null,
        idempotencyKey
      });

      execution.commitReached = true;
      execution.rpcInvoked = true;
      execution.postCommitHealthReached = outcome.state === "ACTIVATED_HEALTH_FAILED";

      const response = toPublicActivationResponse(outcome);
      assertActivationResponseSafe(response);
      return NextResponse.json(response, { status: activationHttpStatus(outcome.state) });
    } catch (error) {
      return activationFailureResponse(error, correlationId, context, deps, execution);
    }
  };
}

const FORBIDDEN_RESPONSE_KEYS = [
  "accessToken",
  "access_token",
  "ciphertext",
  "encrypted",
  "tokenFingerprint",
  "authorization"
] as const;

export function assertActivationResponseSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const key of FORBIDDEN_RESPONSE_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Activation response must not include ${key}`);
    }
  }
}

export const POST = createMetaPageCredentialVerifyAndActivateHandler();
