import type { AuthContext } from "../../interfaces/api/auth.js";
import type {
  FacebookOAuthCompleteDto,
  FacebookOAuthHealthDto,
  FacebookOAuthHealthStatus,
  FacebookOAuthPageOptionDto,
  FacebookOAuthReconnectDto,
  FacebookOAuthSessionDto,
  FacebookOAuthStatusDto
} from "../../domain/facebookOAuth.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { OAuthErrorCategory, OAuthTransactionRecord } from "../../domain/oauthTransactions.js";
import type { ChannelConnectionRepository, ChannelSettingRepository, OAuthTransactionRepository } from "../../domain/ports.js";
import {
  FacebookGraphOAuthError,
  buildFacebookOAuthAuthorizeUrl,
  exchangeFacebookLongLivedPageToken,
  exchangeFacebookLongLivedUserToken,
  exchangeFacebookOAuthCode,
  listFacebookManagedPages,
  mapFacebookOAuthCallbackQueryError,
  subscribeFacebookPageToApp
} from "../../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  OAuthTransactionConflictError,
  OAuthTransactionNotFoundError
} from "../../infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.js";
import { assertChannelConnectionStatusTransition, canTransitionChannelConnectionStatus } from "../../lib/channelConnectionLifecycle.js";
import {
  facebookOAuthScopes,
  getRequiredFacebookPageTasks,
  readFacebookOAuthServerConfig,
  resolveFacebookOAuthAvailability,
  type FacebookOAuthServerConfig
} from "../../lib/facebookOAuthConfig.js";
import { deriveFacebookOAuthDisplayState } from "../../lib/facebookOAuthDisplayState.js";
import {
  buildFacebookOAuthTransactionExpiresAt,
  generateFacebookOAuthResumeSessionValue,
  generateFacebookOAuthState,
  hashFacebookOAuthSecret,
  isFacebookOAuthTransactionExpired
} from "../../lib/facebookOAuthSecurity.js";
import { sanitizeProviderErrorMessage } from "../../lib/sanitizeProviderError.js";
import { runFacebookOperationalHealth } from "./facebookOAuthOperationalHealth.js";
import { isOAuthManagedFacebookConnection } from "./facebookOAuthRuntimeCredential.js";

export type FacebookOAuthServiceDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  oauthTransactionRepository: OAuthTransactionRepository;
  channelSettingRepository: ChannelSettingRepository;
  config?: FacebookOAuthServerConfig;
  now?: () => Date;
};

export class FacebookOAuthService {
  private readonly config: FacebookOAuthServerConfig;
  private readonly now: () => Date;

  constructor(private readonly deps: FacebookOAuthServiceDeps) {
    this.config = deps.config ?? readFacebookOAuthServerConfig();
    this.now = deps.now ?? (() => new Date());
  }

  private graphConfig() {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("Facebook OAuth is not configured");
    }
    return {
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      graphVersion: this.config.graphVersion,
      callbackUrl: this.config.callbackUrl
    };
  }

  private async ensureFacebookConnection(auth: AuthContext): Promise<ChannelConnectionRecord> {
    if (!auth.salesAgentId) {
      throw new Error("Forbidden");
    }

    let connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      auth.tenantId,
      "FACEBOOK"
    );

    if (!connection) {
      connection = await this.deps.channelConnectionRepository.createConnection({
        tenantId: auth.tenantId,
        provider: "FACEBOOK",
        status: "DRAFT",
        connectedBy: auth.salesAgentId
      });
    }

    if (connection.status === "READY" || connection.status === "CONNECTED") {
      throw new Error("Facebook connection already established");
    }

    if (connection.status !== "AUTHORIZING") {
      assertChannelConnectionStatusTransition(connection.status, "AUTHORIZING");
      connection = await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: "AUTHORIZING",
        connectedBy: auth.salesAgentId
      });
    }

    return connection;
  }

  private async resolveActiveTransactionForAuth(
    auth: AuthContext,
    resumeSessionHash: string | null
  ): Promise<OAuthTransactionRecord> {
    if (!resumeSessionHash) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }
    const transaction =
      await this.deps.oauthTransactionRepository.findActiveByResumeSessionHash(resumeSessionHash);
    if (!transaction) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }
    if (transaction.tenantId !== auth.tenantId) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }
    if (transaction.initiatedByAuthUserId !== auth.userId) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }
    if (isFacebookOAuthTransactionExpired(transaction.expiresAt, this.now())) {
      throw new OAuthTransactionNotFoundError("OAuth session expired");
    }
    return transaction;
  }

  private derivePersistedHealthStatus(connection: ChannelConnectionRecord | null): FacebookOAuthHealthStatus {
    if (!connection) return "UNKNOWN";
    if (connection.status === "RECONNECT_REQUIRED" || connection.status === "REVOKED") {
      return "RECONNECT_REQUIRED";
    }
    if (connection.status === "READY") return "OK";
    if (connection.status === "ERROR") return "ERROR";
    if (connection.lastHealthCheckAt && connection.status === "AUTHORIZING") {
      if (connection.lastErrorCode === "RECONNECT_REQUIRED") return "RECONNECT_REQUIRED";
      if (connection.lastErrorCode === "PROVIDER_TEMPORARY") return "ERROR";
      return "DEGRADED";
    }
    return "UNKNOWN";
  }

  private async buildStatusDto(
    auth: AuthContext,
    connection: ChannelConnectionRecord | null,
    transaction: OAuthTransactionRecord | null
  ): Promise<FacebookOAuthStatusDto> {
    const manual = await this.deps.channelSettingRepository.findByTenantAndChannel(
      auth.tenantId,
      "FACEBOOK"
    );
    const credentialMetadata = connection
      ? await this.deps.channelConnectionRepository.listCredentialMetadataByConnection(
          auth.tenantId,
          connection.id
        )
      : [];
    const accessTokenMeta = credentialMetadata.find((row) => row.credentialType === "ACCESS_TOKEN");

    const connectionStatus = connection?.status ?? null;
    const oauthStage = transaction?.status ?? null;
    const healthStatus = this.derivePersistedHealthStatus(connection);
    const reconnectRequired =
      connectionStatus === "RECONNECT_REQUIRED" || connectionStatus === "REVOKED";
    const errorCategory =
      connection?.lastErrorCode &&
      [
        "ACCESS_DENIED",
        "INVALID_OR_EXPIRED_STATE",
        "SESSION_EXPIRED",
        "NO_PAGES",
        "MISSING_PAGE_TASKS",
        "TOKEN_EXCHANGE_FAILED",
        "PROVIDER_TEMPORARY",
        "RECONNECT_REQUIRED",
        "UNKNOWN"
      ].includes(connection.lastErrorCode)
        ? (connection.lastErrorCode as OAuthErrorCategory)
        : (transaction?.errorCategory ?? null);
    const displayState = deriveFacebookOAuthDisplayState({
      connectionStatus,
      oauthStage,
      healthStatus,
      reconnectRequired,
      manualConfigured: Boolean(manual?.configured),
      hasConnection: Boolean(connection)
    });

    return {
      connectionId: connection?.id ?? null,
      connectionStatus,
      displayState,
      oauthStage,
      healthStatus,
      reconnectRequired,
      providerPageId: connection?.providerPageId ?? null,
      providerPageName: connection?.providerAccountName ?? null,
      manualConfigured: Boolean(manual?.configured),
      oauthAvailable: resolveFacebookOAuthAvailability(this.config).oauthAvailable,
      lastCheckedAt: connection?.lastHealthCheckAt?.toISOString() ?? null,
      lastVerifiedAt: connection?.lastOutboundVerifiedAt?.toISOString() ?? null,
      errorCategory,
      message: connection?.lastErrorMessageSafe ?? null,
      credentialState: {
        pageAccessToken: accessTokenMeta?.credentialState ?? "EMPTY"
      }
    };
  }

  async getStatus(auth: AuthContext): Promise<FacebookOAuthStatusDto> {
    const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      auth.tenantId,
      "FACEBOOK"
    );
    return this.buildStatusDto(auth, connection, null);
  }

  async startOAuth(auth: AuthContext): Promise<{ authorizeUrl: string; expiresAt: string }> {
    if (!resolveFacebookOAuthAvailability(this.config).oauthAvailable) {
      throw new Error("Facebook OAuth is not available");
    }
    if (!auth.salesAgentId) {
      throw new Error("Forbidden");
    }

    const connection = await this.ensureFacebookConnection(auth);
    const state = generateFacebookOAuthState();
    const stateHash = hashFacebookOAuthSecret(state);
    const expiresAt = buildFacebookOAuthTransactionExpiresAt(this.now());

    await this.deps.oauthTransactionRepository.createTransaction({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      provider: "FACEBOOK",
      stateHash,
      initiatedByAuthUserId: auth.userId,
      initiatedBySalesAgentId: auth.salesAgentId,
      expiresAt
    });

    const authorizeUrl = buildFacebookOAuthAuthorizeUrl({
      config: this.graphConfig(),
      state,
      scopes: facebookOAuthScopes()
    });

    return { authorizeUrl, expiresAt: expiresAt.toISOString() };
  }

  async handleCallback(input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    error_reason?: string | null;
  }): Promise<{
    redirectUrl: string;
    resumeCookieValue: string | null;
    clearCookie: boolean;
  }> {
    const baseRedirect = this.config.appBaseUrl;
    if (input.error) {
      const category = mapFacebookOAuthCallbackQueryError(input);
      return {
        redirectUrl: `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=${category}`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }

    const code = input.code?.trim();
    const state = input.state?.trim();
    if (!code || !state) {
      return {
        redirectUrl: `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=INVALID_OR_EXPIRED_STATE`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }

    const stateHash = hashFacebookOAuthSecret(state);
    const transaction = await this.deps.oauthTransactionRepository.findActiveByStateHash(stateHash);
    if (!transaction) {
      return {
        redirectUrl: `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=INVALID_OR_EXPIRED_STATE`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }

    try {
      const shortLived = await exchangeFacebookOAuthCode(this.graphConfig(), code);
      const longLived = await exchangeFacebookLongLivedUserToken(
        this.graphConfig(),
        shortLived.accessToken
      );
      const resumeSessionValue = generateFacebookOAuthResumeSessionValue();
      const resumeSessionHash = hashFacebookOAuthSecret(resumeSessionValue);
      const userTokenExpiresAt =
        longLived.expiresIn != null
          ? new Date(this.now().getTime() + longLived.expiresIn * 1000)
          : null;

      await this.deps.oauthTransactionRepository.consumeStateAtCallback({
        stateHash,
        resumeSessionHash,
        userAccessToken: longLived.accessToken,
        userTokenExpiresAt
      });

      return {
        redirectUrl: `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook&oauth=success`,
        resumeCookieValue: resumeSessionValue,
        clearCookie: false
      };
    } catch (error) {
      const category =
        error instanceof FacebookGraphOAuthError ? error.category : ("TOKEN_EXCHANGE_FAILED" as const);
      await this.deps.oauthTransactionRepository.updateTransaction({
        transactionId: transaction.id,
        tenantId: transaction.tenantId,
        status: "FAILED",
        errorCategory: category
      });
      return {
        redirectUrl: `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook&oauth=error&errorCategory=${category}`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }
  }

  async getSession(auth: AuthContext, resumeSessionHash: string | null): Promise<FacebookOAuthSessionDto> {
    const transaction = await this.resolveActiveTransactionForAuth(auth, resumeSessionHash);
    const displayState = deriveFacebookOAuthDisplayState({
      connectionStatus: "AUTHORIZING",
      oauthStage: transaction.status,
      healthStatus: "UNKNOWN",
      reconnectRequired: false,
      hasConnection: true
    });

    return {
      oauthStage: transaction.status,
      displayState,
      errorCategory: transaction.errorCategory,
      message: null,
      expiresAt: transaction.expiresAt.toISOString(),
      pagesReady: transaction.status === "PAGES_READY" || Boolean(transaction.pageCandidatesJson?.length)
    };
  }

  private mapPageOptions(
    pages: Awaited<ReturnType<typeof listFacebookManagedPages>>,
    connection: ChannelConnectionRecord | null
  ): FacebookOAuthPageOptionDto[] {
    const requiredTasks = getRequiredFacebookPageTasks();
    return pages.map((page) => {
      const missingTasks = requiredTasks.filter((task) => !page.tasks.includes(task));
      const selectable = missingTasks.length === 0;
      return {
        pageId: page.pageId,
        name: page.name,
        tasks: page.tasks,
        selectable,
        reasonCode: selectable ? null : "MISSING_PAGE_TASKS",
        alreadyConnected: Boolean(
          connection?.providerPageId && connection.providerPageId === page.pageId
        )
      };
    });
  }

  async listPages(
    auth: AuthContext,
    resumeSessionHash: string | null
  ): Promise<{ pages: FacebookOAuthPageOptionDto[] }> {
    const transaction = await this.resolveActiveTransactionForAuth(auth, resumeSessionHash);
    const connection = await this.deps.channelConnectionRepository.findById(
      auth.tenantId,
      transaction.connectionId
    );

    if (transaction.pageCandidatesJson?.length) {
      return { pages: transaction.pageCandidatesJson };
    }

    const userToken = await this.deps.oauthTransactionRepository.getDecryptedUserToken(
      transaction.id,
      auth.tenantId
    );
    if (!userToken) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }

    const graphPages = await listFacebookManagedPages(this.graphConfig(), userToken);
    const pages = this.mapPageOptions(graphPages, connection);
    const nextStatus = pages.length > 0 ? "PAGES_READY" : "CALLBACK_RECEIVED";

    await this.deps.oauthTransactionRepository.updateTransaction({
      transactionId: transaction.id,
      tenantId: auth.tenantId,
      status: nextStatus,
      pageCandidatesJson: pages
    });

    return { pages };
  }

  async complete(
    auth: AuthContext,
    resumeSessionHash: string | null,
    pageId: string
  ): Promise<FacebookOAuthCompleteDto> {
    if (!auth.salesAgentId) {
      throw new Error("Forbidden");
    }

    const transaction = await this.resolveActiveTransactionForAuth(auth, resumeSessionHash);
    const selectedPageId = pageId.trim();
    if (!selectedPageId) {
      throw new Error("pageId is required");
    }

    let pages = transaction.pageCandidatesJson;
    if (!pages?.length) {
      const listed = await this.listPages(auth, resumeSessionHash);
      pages = listed.pages;
    }

    const selected = pages.find((page) => page.pageId === selectedPageId);
    if (!selected) {
      throw new Error("Selected Page is not available");
    }
    if (!selected.selectable) {
      throw new Error("Selected Page is missing required permissions");
    }

    const userToken = await this.deps.oauthTransactionRepository.getDecryptedUserToken(
      transaction.id,
      auth.tenantId
    );
    if (!userToken) {
      throw new OAuthTransactionNotFoundError("OAuth session not found");
    }

    const graphPages = await listFacebookManagedPages(this.graphConfig(), userToken);
    const graphPage = graphPages.find((page) => page.pageId === selectedPageId);
    if (!graphPage) {
      throw new Error("Selected Page is not available");
    }

    const longLivedPage = await exchangeFacebookLongLivedPageToken(
      this.graphConfig(),
      graphPage.accessToken
    );
    const tokenExpiresAt =
      longLivedPage.expiresIn != null
        ? new Date(this.now().getTime() + longLivedPage.expiresIn * 1000)
        : null;

    const connection = await this.deps.channelConnectionRepository.findById(
      auth.tenantId,
      transaction.connectionId
    );
    if (!connection) {
      throw new OAuthTransactionNotFoundError("OAuth connection not found");
    }

    if (connection.status !== "AUTHORIZING") {
      await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: "AUTHORIZING",
        connectedBy: auth.salesAgentId
      });
    }

    await this.deps.channelConnectionRepository.storeEncryptedCredential({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      provider: "FACEBOOK",
      credentialType: "ACCESS_TOKEN",
      plaintextSecret: longLivedPage.accessToken,
      tokenExpiresAt,
      credentialState: "SET"
    });

    // Subscribe Page to this Meta app so Messenger events hit /api/webhook/facebook.
    try {
      await subscribeFacebookPageToApp({
        graphVersion: this.config.graphVersion,
        pageId: graphPage.pageId,
        pageAccessToken: longLivedPage.accessToken
      });
      await this.deps.channelConnectionRepository.updateWebhookStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        webhookActive: true,
        webhookEndpoint: `${(process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").replace(/\/$/, "")}/api/webhook/facebook`
      });
    } catch {
      // Keep AUTHORIZING + token; operator can retry via health. Do not fail complete.
      await this.deps.channelConnectionRepository.updateWebhookStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        webhookActive: false
      });
    }

    const completedAt = this.now();
    await this.deps.channelConnectionRepository.updateProviderMetadata({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      providerPageId: graphPage.pageId,
      providerAccountName: graphPage.name,
      providerAccountId: graphPage.pageId
    });
    await this.deps.channelConnectionRepository.updateLifecycleStatus({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      status: "AUTHORIZING",
      connectedAt: completedAt,
      connectedBy: auth.salesAgentId
    });

    await this.deps.oauthTransactionRepository.updateTransaction({
      transactionId: transaction.id,
      tenantId: auth.tenantId,
      status: "COMPLETED",
      selectedPageId: selectedPageId,
      consumedAt: completedAt
    });

    return {
      connectionId: connection.id,
      connectionStatus: "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: "UNKNOWN",
      displayState: "CONNECTING",
      reconnectRequired: false,
      providerPageId: graphPage.pageId,
      providerPageName: graphPage.name,
      message: "Page connected. Run operational validation to finish setup."
    };
  }

  async runOperationalHealth(auth: AuthContext): Promise<FacebookOAuthHealthDto> {
    if (!auth.salesAgentId) {
      throw new Error("Forbidden");
    }

    const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      auth.tenantId,
      "FACEBOOK"
    );
    if (!connection) {
      throw new Error("Facebook connection not found");
    }

    const { result, persistStatus } = await runFacebookOperationalHealth({
      tenantId: auth.tenantId,
      connection,
      channelConnectionRepository: this.deps.channelConnectionRepository,
      channelSettingRepository: this.deps.channelSettingRepository,
      oauthTransactionRepository: this.deps.oauthTransactionRepository,
      graphVersion: this.config.graphVersion,
      now: this.now
    });

    const checkedAt = new Date(result.lastCheckedAt);
    if (persistStatus !== connection.status) {
      assertChannelConnectionStatusTransition(connection.status, persistStatus);
      await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: persistStatus,
        connectedBy: auth.salesAgentId
      });
    }

    await this.deps.channelConnectionRepository.updateHealthFields({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      lastHealthCheckAt: checkedAt,
      lastErrorCode: result.errorCategory,
      lastErrorMessageSafe: result.message
    });

    // Ensure Page is subscribed to this Meta app (idempotent) when health is healthy.
    if (
      result.healthStatus === "OK" &&
      connection.providerPageId &&
      !connection.webhookActive
    ) {
      try {
        const secret = await this.deps.channelConnectionRepository.retrieveDecryptedCredentialForRuntime({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          credentialType: "ACCESS_TOKEN"
        });
        if (secret?.plaintextSecret) {
          await subscribeFacebookPageToApp({
            graphVersion: this.config.graphVersion,
            pageId: connection.providerPageId,
            pageAccessToken: secret.plaintextSecret
          });
          await this.deps.channelConnectionRepository.updateWebhookStatus({
            tenantId: auth.tenantId,
            connectionId: connection.id,
            webhookActive: true,
            webhookEndpoint: `${(process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").replace(/\/$/, "")}/api/webhook/facebook`
          });
        }
      } catch {
        // Health already passed; subscription can be retried on next validation.
      }
    }

    return result;
  }

  async startReconnect(auth: AuthContext): Promise<FacebookOAuthReconnectDto> {
    if (!resolveFacebookOAuthAvailability(this.config).oauthAvailable) {
      throw new Error("Facebook OAuth is not available");
    }
    if (!auth.salesAgentId) {
      throw new Error("Forbidden");
    }

    const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
      auth.tenantId,
      "FACEBOOK"
    );
    if (!connection) {
      throw new Error("Facebook connection not found");
    }

    const credentialMetadata =
      await this.deps.channelConnectionRepository.listCredentialMetadataByConnection(
        auth.tenantId,
        connection.id
      );
    if (!isOAuthManagedFacebookConnection(connection, credentialMetadata)) {
      throw new Error("Facebook OAuth connection is not established");
    }

    await this.deps.oauthTransactionRepository.expireActiveTransactionsForConnection(
      auth.tenantId,
      connection.id
    );

    if (
      connection.status !== "AUTHORIZING" &&
      canTransitionChannelConnectionStatus(connection.status, "AUTHORIZING")
    ) {
      await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: "AUTHORIZING",
        connectedBy: auth.salesAgentId
      });
    }

    const state = generateFacebookOAuthState();
    const stateHash = hashFacebookOAuthSecret(state);
    const expiresAt = buildFacebookOAuthTransactionExpiresAt(this.now());

    await this.deps.oauthTransactionRepository.createTransaction({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      provider: "FACEBOOK",
      stateHash,
      initiatedByAuthUserId: auth.userId,
      initiatedBySalesAgentId: auth.salesAgentId,
      expiresAt
    });

    const authorizeUrl = buildFacebookOAuthAuthorizeUrl({
      config: this.graphConfig(),
      state,
      scopes: facebookOAuthScopes()
    });

    return { authorizeUrl, expiresAt: expiresAt.toISOString() };
  }

  sanitizeOperatorMessage(message: string): string {
    return sanitizeProviderErrorMessage(message);
  }
}
