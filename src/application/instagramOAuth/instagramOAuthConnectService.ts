import type { AuthContext } from "../../interfaces/api/auth.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { InstagramOAuthCredentialMetadata } from "../../domain/instagramOAuthCredentials.js";
import type { InstagramOAuthReturnDestination } from "../../domain/instagramOAuthStates.js";
import type {
  ChannelConnectionRepository,
  InstagramOAuthCredentialRepository,
  InstagramOAuthStateRepository
} from "../../domain/ports.js";
import {
  InstagramBusinessLoginOAuthError,
  createInstagramOAuthProviderClient,
  type InstagramOAuthProviderClient
} from "../../infrastructure/adapters/meta/instagramBusinessLoginOAuth.js";
import {
  InstagramOAuthStateConflictError,
  InstagramOAuthStateNotFoundError
} from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthStateRepository.js";
import { InstagramOAuthCredentialVersionConflictError } from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthCredentialRepository.js";
import {
  emitInstagramOAuthAudit,
  type InstagramOAuthAuditSink
} from "../../lib/instagramOAuthAudit.js";
import {
  instagramOAuthConnectScopes,
  readInstagramOAuthServerConfig,
  resolveInstagramOAuthConnectAvailability,
  type InstagramOAuthServerConfig
} from "../../lib/instagramOAuthConfig.js";
import {
  InstagramOAuthConnectError,
  mapProviderCallbackErrorToCode,
  type InstagramOAuthConnectErrorCode
} from "../../lib/instagramOAuthConnectErrors.js";
import { isInstagramOAuthConnectEnabled } from "../../lib/instagramOAuthConnectFlags.js";
import {
  assertInstagramOAuthRedirectUrlSafe,
  buildInstagramOAuthChannelSettingsRedirectUrl
} from "../../lib/instagramOAuthRedirect.js";
import {
  buildInstagramOAuthStateExpiresAt,
  generateInstagramOAuthState,
  hashInstagramOAuthState
} from "../../lib/instagramOAuthSecurity.js";

const MAX_CALLBACK_PARAM_LENGTH = 2048;
const LONG_LIVED_REFRESH_ELIGIBLE_HOURS = 24;

export type StartInstagramOAuthRequest = {
  channelConnectionId: string;
  returnTo?: InstagramOAuthReturnDestination;
};

export type StartInstagramOAuthResponse = {
  authorizationUrl: string;
  expiresAt: string;
};

export type InstagramOAuthCallbackQuery = {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_reason?: string | null;
  error_description?: string | null;
};

export type InstagramOAuthCallbackResult = {
  redirectUrl: string;
};

export type InstagramOAuthConnectServiceDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  instagramOAuthStateRepository: InstagramOAuthStateRepository;
  instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository;
  config?: InstagramOAuthServerConfig;
  providerClient?: InstagramOAuthProviderClient;
  auditSink?: InstagramOAuthAuditSink;
  now?: () => Date;
};

function assertConnectAvailable(config: InstagramOAuthServerConfig): void {
  if (!resolveInstagramOAuthConnectAvailability(config).connectAvailable) {
    throw new InstagramOAuthConnectError(
      "INSTAGRAM_OAUTH_DISABLED",
      "Instagram OAuth connect is disabled",
      503
    );
  }
}

function normalizeCallbackParam(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CALLBACK_PARAM_LENGTH) {
    throw new InstagramOAuthConnectError(
      "INSTAGRAM_OAUTH_CALLBACK_INVALID",
      "OAuth callback parameter exceeds maximum length",
      400,
      true
    );
  }
  return trimmed;
}

function isBlockingExistingCredential(status: InstagramOAuthCredentialMetadata["credentialStatus"]): boolean {
  return status === "ACTIVE" || status === "TOKEN_EXPIRING" || status === "REFRESHING";
}

function computeTokenExpiry(now: Date, expiresInSeconds?: number): Date {
  if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
    return new Date(now.getTime() + expiresInSeconds * 1000);
  }
  return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
}

function computeRefreshEligibleAt(now: Date): Date {
  return new Date(now.getTime() + LONG_LIVED_REFRESH_ELIGIBLE_HOURS * 60 * 60 * 1000);
}

export class InstagramOAuthConnectService {
  private readonly config: InstagramOAuthServerConfig;
  private readonly now: () => Date;
  private readonly auditSink: InstagramOAuthAuditSink;
  private readonly providerClient: InstagramOAuthProviderClient | null;

  constructor(private readonly deps: InstagramOAuthConnectServiceDeps) {
    this.config = deps.config ?? readInstagramOAuthServerConfig();
    this.now = deps.now ?? (() => new Date());
    this.auditSink = deps.auditSink ?? (() => undefined);
    if (deps.providerClient) {
      this.providerClient = deps.providerClient;
    } else if (this.config.appId && this.config.appSecret) {
      this.providerClient = createInstagramOAuthProviderClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        graphVersion: this.config.graphVersion,
        callbackUrl: this.config.callbackUrl
      });
    } else {
      this.providerClient = null;
    }
  }

  private redirect(
    returnDestination: InstagramOAuthReturnDestination,
    result: "connected" | "error",
    errorCode?: InstagramOAuthConnectErrorCode | null
  ): InstagramOAuthCallbackResult {
    const redirectUrl = buildInstagramOAuthChannelSettingsRedirectUrl({
      appBaseUrl: this.config.appBaseUrl,
      result,
      errorCode
    });
    assertInstagramOAuthRedirectUrlSafe(redirectUrl);
    return { redirectUrl };
  }

  private async loadOwnedInstagramConnection(
    auth: AuthContext,
    channelConnectionId: string
  ): Promise<ChannelConnectionRecord> {
    const connection = await this.deps.channelConnectionRepository.findById(
      auth.tenantId,
      channelConnectionId
    );
    if (!connection) {
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_CONNECTION_NOT_FOUND",
        "Channel connection not found",
        404
      );
    }
    if (connection.provider !== "INSTAGRAM") {
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_CONNECTION_PROVIDER_MISMATCH",
        "Channel connection provider mismatch",
        400
      );
    }
    return connection;
  }

  async startOAuth(
    auth: AuthContext,
    input: StartInstagramOAuthRequest
  ): Promise<StartInstagramOAuthResponse> {
    assertConnectAvailable(this.config);
    if (!auth.salesAgentId) {
      throw new InstagramOAuthConnectError("INSTAGRAM_OAUTH_CALLBACK_INVALID", "Forbidden", 403);
    }

    const connection = await this.loadOwnedInstagramConnection(auth, input.channelConnectionId);
    const existing = await this.deps.instagramOAuthCredentialRepository.findActiveByConnection({
      tenantId: auth.tenantId,
      channelConnectionId: connection.id
    });
    if (existing && isBlockingExistingCredential(existing.credentialStatus)) {
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_ALREADY_CONNECTED",
        "Instagram connection already has an active credential",
        409
      );
    }

    const state = generateInstagramOAuthState();
    const stateHash = hashInstagramOAuthState(state);
    const expiresAt = buildInstagramOAuthStateExpiresAt(this.now());
    const scopes = instagramOAuthConnectScopes();
    const returnDestination = input.returnTo ?? "CHANNEL_SETTINGS";

    await this.deps.instagramOAuthStateRepository.createState({
      tenantId: auth.tenantId,
      channelConnectionId: connection.id,
      stateHash,
      returnDestination,
      requestedScopes: scopes,
      initiatedByAuthUserId: auth.userId,
      initiatedBySalesAgentId: auth.salesAgentId,
      expiresAt
    });

    emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_STARTED", {
      tenantId: auth.tenantId,
      channelConnectionId: connection.id,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN"
    });

    if (!this.providerClient) {
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_DISABLED",
        "Instagram OAuth provider is not configured",
        503
      );
    }

    const authorizationUrl = this.providerClient.buildAuthorizationUrl({ state, scopes });
    return {
      authorizationUrl,
      expiresAt: expiresAt.toISOString()
    };
  }

  private async persistCredential(input: {
    tenantId: string;
    channelConnectionId: string;
    accessToken: string;
    providerUserId: string;
    grantedScopes: string[] | null;
    tokenExpiresAt: Date;
    refreshEligibleAt: Date;
    connectedBySalesAgentId: string;
  }): Promise<void> {
    const existing = await this.deps.instagramOAuthCredentialRepository.findActiveByConnection({
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId
    });

    if (existing && isBlockingExistingCredential(existing.credentialStatus)) {
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_ALREADY_CONNECTED",
        "Instagram connection already has an active credential",
        409
      );
    }

    const activateInput = {
      tenantId: input.tenantId,
      channelConnectionId: input.channelConnectionId,
      accessToken: input.accessToken,
      tokenExpiresAt: input.tokenExpiresAt,
      refreshEligibleAt: input.refreshEligibleAt,
      providerInstagramAccountId: input.providerUserId,
      providerUserId: input.providerUserId,
      grantedScopes: input.grantedScopes,
      connectedBySalesAgentId: input.connectedBySalesAgentId
    };

    try {
      if (existing) {
        await this.deps.instagramOAuthCredentialRepository.activate({
          ...activateInput,
          credentialId: existing.id
        });
        return;
      }

      const pending = await this.deps.instagramOAuthCredentialRepository.createPending({
        tenantId: input.tenantId,
        channelConnectionId: input.channelConnectionId,
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        connectedBySalesAgentId: input.connectedBySalesAgentId,
        grantedScopes: input.grantedScopes
      });
      await this.deps.instagramOAuthCredentialRepository.activate({
        ...activateInput,
        credentialId: pending.id
      });
    } catch (error) {
      if (error instanceof InstagramOAuthCredentialVersionConflictError) {
        throw new InstagramOAuthConnectError(
          "INSTAGRAM_OAUTH_CREDENTIAL_CONFLICT",
          "Instagram OAuth credential conflict",
          409,
          true
        );
      }
      throw new InstagramOAuthConnectError(
        "INSTAGRAM_OAUTH_PERSISTENCE_FAILED",
        "Failed to persist Instagram OAuth credential",
        500,
        true
      );
    }
  }

  async handleCallback(query: InstagramOAuthCallbackQuery): Promise<InstagramOAuthCallbackResult> {
    const state = normalizeCallbackParam(query.state);
    if (!state) {
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_STATE_INVALID");
    }

    const now = this.now();
    const stateHash = hashInstagramOAuthState(state);
    let claimed;
    try {
      claimed = await this.deps.instagramOAuthStateRepository.claimStateAtCallback({
        stateHash,
        provider: "INSTAGRAM",
        now
      });
    } catch (error) {
      if (error instanceof InstagramOAuthStateConflictError) {
        emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_STATE_REPLAY_REJECTED", {
          provider: "INSTAGRAM",
          resultCode: "INSTAGRAM_OAUTH_STATE_REPLAYED"
        });
        return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_STATE_REPLAYED");
      }
      if (error instanceof InstagramOAuthStateNotFoundError) {
        const message = error.message.toLowerCase();
        const code = message.includes("expired")
          ? "INSTAGRAM_OAUTH_STATE_EXPIRED"
          : "INSTAGRAM_OAUTH_STATE_INVALID";
        return this.redirect("CHANNEL_SETTINGS", "error", code);
      }
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_STATE_INVALID");
    }

    const finalize = async (
      status: "CONSUMED" | "FAILED",
      failureCode?: InstagramOAuthConnectErrorCode
    ) => {
      await this.deps.instagramOAuthStateRepository.finalizeState({
        stateId: claimed.id,
        status,
        failureCode: failureCode ?? null
      });
    };

    if (!isInstagramOAuthConnectEnabled() || !resolveInstagramOAuthConnectAvailability(this.config).connectAvailable) {
      await finalize("FAILED", "INSTAGRAM_OAUTH_DISABLED");
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_DISABLED");
    }

    const providerError = normalizeCallbackParam(query.error);
    const code = normalizeCallbackParam(query.code);
  void normalizeCallbackParam(query.error_reason);
  void normalizeCallbackParam(query.error_description);

    if (providerError && code) {
      await finalize("FAILED", "INSTAGRAM_OAUTH_CALLBACK_INVALID");
      emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_CALLBACK_FAILED", {
        tenantId: claimed.tenantId,
        channelConnectionId: claimed.channelConnectionId,
        provider: "INSTAGRAM",
        resultCode: "INSTAGRAM_OAUTH_CALLBACK_INVALID"
      });
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_CALLBACK_INVALID");
    }

    if (providerError) {
      const deniedCode = mapProviderCallbackErrorToCode({
        error: providerError,
        error_reason: query.error_reason
      });
      await finalize("FAILED", deniedCode);
      emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_CALLBACK_DENIED", {
        tenantId: claimed.tenantId,
        channelConnectionId: claimed.channelConnectionId,
        provider: "INSTAGRAM",
        resultCode: deniedCode
      });
      return this.redirect("CHANNEL_SETTINGS", "error", deniedCode);
    }

    if (!code) {
      await finalize("FAILED", "INSTAGRAM_OAUTH_CALLBACK_INVALID");
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_CALLBACK_INVALID");
    }

    if (!this.providerClient) {
      await finalize("FAILED", "INSTAGRAM_OAUTH_DISABLED");
      return this.redirect("CHANNEL_SETTINGS", "error", "INSTAGRAM_OAUTH_DISABLED");
    }

    try {
      const shortLived = await this.providerClient.exchangeAuthorizationCode(code);
      const longLived = await this.providerClient.exchangeForLongLivedAccessToken(shortLived.accessToken);
      const tokenExpiresAt = computeTokenExpiry(now, longLived.expiresInSeconds ?? shortLived.expiresInSeconds);
      const refreshEligibleAt = computeRefreshEligibleAt(now);

      await this.persistCredential({
        tenantId: claimed.tenantId,
        channelConnectionId: claimed.channelConnectionId,
        accessToken: longLived.accessToken,
        providerUserId: shortLived.providerUserId,
        grantedScopes: shortLived.grantedScopes ?? claimed.requestedScopes,
        tokenExpiresAt,
        refreshEligibleAt,
        connectedBySalesAgentId: claimed.initiatedBySalesAgentId
      });

      await finalize("CONSUMED");
      emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_CALLBACK_SUCCEEDED", {
        tenantId: claimed.tenantId,
        channelConnectionId: claimed.channelConnectionId,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        resultCode: "connected"
      });
      return this.redirect("CHANNEL_SETTINGS", "connected");
    } catch (error) {
      let failureCode: InstagramOAuthConnectErrorCode = "INSTAGRAM_OAUTH_EXCHANGE_FAILED";
      if (error instanceof InstagramOAuthConnectError) {
        failureCode = error.code;
      } else if (error instanceof InstagramBusinessLoginOAuthError) {
        failureCode = error.code;
      }
      await finalize("FAILED", failureCode);
      emitInstagramOAuthAudit(this.auditSink, "INSTAGRAM_OAUTH_CALLBACK_FAILED", {
        tenantId: claimed.tenantId,
        channelConnectionId: claimed.channelConnectionId,
        provider: "INSTAGRAM",
        resultCode: failureCode
      });
      return this.redirect("CHANNEL_SETTINGS", "error", failureCode);
    }
  }
}
