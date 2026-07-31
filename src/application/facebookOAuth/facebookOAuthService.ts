import type { AuthContext } from "../../interfaces/api/auth.js";
import type {
  FacebookOAuthCompleteDto,
  FacebookOAuthHealthDto,
  FacebookOAuthHealthStatus,
  FacebookOAuthPageOptionDto,
  FacebookOAuthReauthorizeDto,
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
  mapFacebookOAuthCallbackQueryError
} from "../../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  subscribeAndVerifyFacebookPageWebhook
} from "../../lib/facebookPageWebhookSubscription.js";
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
    let transaction: OAuthTransactionRecord | null = null;

    if (resumeSessionHash) {
      transaction =
        await this.deps.oauthTransactionRepository.findActiveByResumeSessionHash(resumeSessionHash);
      // Stale/foreign resume cookies must not block auth-scoped PAGES_READY recovery.
      if (
        transaction &&
        (transaction.tenantId !== auth.tenantId || transaction.initiatedByAuthUserId !== auth.userId)
      ) {
        transaction = null;
      }
    }

    // Resume cookie can be lost after callback redirect / reload while the DB tx is still
    // PAGES_READY. Recover the caller's latest active transaction for this Facebook connection.
    if (!transaction) {
      const connection = await this.deps.channelConnectionRepository.findByTenantAndProvider(
        auth.tenantId,
        "FACEBOOK"
      );
      if (connection) {
        transaction = await this.deps.oauthTransactionRepository.findLatestActiveForConnectionAndUser({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          authUserId: auth.userId
        });
      }
    }

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
    // Only surface reconnect when lifecycle itself requires it — never from stale
    // last_error_* while the operator has already moved into AUTHORIZING reconnect/OAuth.
    if (connection.status === "RECONNECT_REQUIRED" || connection.status === "REVOKED") {
      return "RECONNECT_REQUIRED";
    }
    if (connection.status === "READY") return "OK";
    if (connection.status === "ERROR") return "ERROR";
    // AUTHORIZING and other pre-READY lifecycle states wait for operational health.
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
        "PAGE_MISMATCH",
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
    // AUTHORIZING status historically omitted oauthStage (transaction=null), so UI stayed
    // CONNECTING and "Continue Connect" restarted Meta OAuth.
    // Prefer in-flight PAGES_READY/CALLBACK_RECEIVED over an older COMPLETED row (reconnect).
    // Fall back to COMPLETED when a Page is already linked and health has not run yet (A6-D).
    let transaction: OAuthTransactionRecord | null = null;
    if (connection?.status === "AUTHORIZING") {
      transaction = await this.deps.oauthTransactionRepository.findLatestActiveForConnectionAndUser({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        authUserId: auth.userId
      });
      if (!transaction && connection.providerPageId) {
        transaction = await this.deps.oauthTransactionRepository.findLatestCompletedForConnection(
          auth.tenantId,
          connection.id
        );
      }
    }
    return this.buildStatusDto(auth, connection, transaction);
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
      expiresAt,
      intent: "CONNECT"
    });

    const authorizeUrl = buildFacebookOAuthAuthorizeUrl({
      config: this.graphConfig(),
      state,
      scopes: facebookOAuthScopes()
    });

    return { authorizeUrl, expiresAt: expiresAt.toISOString() };
  }

  private async restoreReadyAfterFailedReauthorize(
    transaction: OAuthTransactionRecord,
    errorCategory: OAuthErrorCategory,
    messageSafe: string
  ): Promise<void> {
    if (transaction.intent !== "REAUTHORIZE") return;
    const connection = await this.deps.channelConnectionRepository.findById(
      transaction.tenantId,
      transaction.connectionId
    );
    if (!connection || connection.status !== "AUTHORIZING") return;
    await this.deps.channelConnectionRepository.updateLifecycleStatus({
      tenantId: transaction.tenantId,
      connectionId: connection.id,
      status: "READY"
    });
    try {
      await this.deps.channelConnectionRepository.updateHealthFields({
        tenantId: transaction.tenantId,
        connectionId: connection.id,
        lastErrorCode: errorCategory,
        lastErrorMessageSafe: messageSafe
      });
    } catch {
      // Credential untouched; lifecycle already restored to READY.
    }
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
    const channelSettings = `${baseRedirect.replace(/\/$/, "")}/dashboard/channel-settings?channel=facebook`;

    if (input.error) {
      const category = mapFacebookOAuthCallbackQueryError(input);
      const state = input.state?.trim();
      if (state) {
        const stateHash = hashFacebookOAuthSecret(state);
        const transaction = await this.deps.oauthTransactionRepository.findActiveByStateHash(stateHash);
        if (transaction) {
          await this.deps.oauthTransactionRepository.updateTransaction({
            transactionId: transaction.id,
            tenantId: transaction.tenantId,
            status: "FAILED",
            errorCategory: category
          });
          await this.restoreReadyAfterFailedReauthorize(
            transaction,
            category,
            "Facebook authorization was cancelled or denied. Existing credentials were not changed."
          );
        }
      }
      return {
        redirectUrl: `${channelSettings}&oauth=error&errorCategory=${category}`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }

    const code = input.code?.trim();
    const state = input.state?.trim();
    if (!code || !state) {
      return {
        redirectUrl: `${channelSettings}&oauth=error&errorCategory=INVALID_OR_EXPIRED_STATE`,
        resumeCookieValue: null,
        clearCookie: true
      };
    }

    const stateHash = hashFacebookOAuthSecret(state);
    const transaction = await this.deps.oauthTransactionRepository.findActiveByStateHash(stateHash);
    if (!transaction) {
      return {
        redirectUrl: `${channelSettings}&oauth=error&errorCategory=INVALID_OR_EXPIRED_STATE`,
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

      const successFlag =
        transaction.intent === "REAUTHORIZE" ? "reauthorize_success" : "success";
      return {
        redirectUrl: `${channelSettings}&oauth=${successFlag}`,
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
      await this.restoreReadyAfterFailedReauthorize(
        transaction,
        category,
        "Facebook token exchange failed. Existing credentials were not changed."
      );
      return {
        redirectUrl: `${channelSettings}&oauth=error&errorCategory=${category}`,
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
    let pages = this.mapPageOptions(graphPages, connection);
    if (transaction.intent === "REAUTHORIZE" && transaction.expectedPageId) {
      const expected = transaction.expectedPageId;
      pages = pages
        .filter((page) => page.pageId === expected)
        .map((page) => ({ ...page, alreadyConnected: true }));
      if (pages.length === 0) {
        pages = [
          {
            pageId: expected,
            name: connection?.providerAccountName ?? `Page ${expected}`,
            tasks: [],
            selectable: false,
            reasonCode: "MISSING_PAGE_TASKS",
            alreadyConnected: true
          }
        ];
      }
    }
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

    if (transaction.intent === "REAUTHORIZE") {
      const expectedPageId = transaction.expectedPageId?.trim() ?? "";
      if (!expectedPageId || selectedPageId !== expectedPageId) {
        await this.deps.oauthTransactionRepository.updateTransaction({
          transactionId: transaction.id,
          tenantId: auth.tenantId,
          status: "FAILED",
          errorCategory: "PAGE_MISMATCH",
          selectedPageId
        });
        await this.restoreReadyAfterFailedReauthorize(
          transaction,
          "PAGE_MISMATCH",
          "Selected Page does not match the linked Facebook Page. Existing credentials were not changed."
        );
        throw new Error(
          "Selected Page does not match the linked Facebook Page. Choose the original Page and try again."
        );
      }
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

    const connection = await this.deps.channelConnectionRepository.findById(
      auth.tenantId,
      transaction.connectionId
    );
    if (!connection) {
      throw new OAuthTransactionNotFoundError("OAuth connection not found");
    }

    // Duplicate / already-completed callback — do not overwrite credentials again.
    if (transaction.status === "COMPLETED" && transaction.selectedPageId === selectedPageId) {
      const isReauth = transaction.intent === "REAUTHORIZE";
      return {
        connectionId: connection.id,
        connectionStatus: isReauth ? "READY" : "AUTHORIZING",
        oauthStage: "COMPLETED",
        healthStatus: isReauth ? "OK" : "UNKNOWN",
        displayState: isReauth ? "CONNECTED" : "CONNECTING",
        reconnectRequired: false,
        providerPageId: connection.providerPageId ?? selectedPageId,
        providerPageName: connection.providerAccountName ?? graphPage.name,
        message: isReauth
          ? "Facebook re-authorization already completed for this Page."
          : "Page connection already completed."
      };
    }

    if (connection.status !== "AUTHORIZING") {
      await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: "AUTHORIZING",
        connectedBy: auth.salesAgentId,
        allowReadyReauthorize: transaction.intent === "REAUTHORIZE"
      });
    }

    let longLivedPage: { accessToken: string; expiresIn: number | null };
    try {
      longLivedPage = await exchangeFacebookLongLivedPageToken(
        this.graphConfig(),
        graphPage.accessToken
      );
    } catch (error) {
      const category =
        error instanceof FacebookGraphOAuthError ? error.category : ("TOKEN_EXCHANGE_FAILED" as const);
      await this.deps.oauthTransactionRepository.updateTransaction({
        transactionId: transaction.id,
        tenantId: auth.tenantId,
        status: "FAILED",
        errorCategory: category
      });
      await this.restoreReadyAfterFailedReauthorize(
        transaction,
        category,
        "Could not resolve Page access token. Existing credentials were not changed."
      );
      throw error instanceof Error ? error : new Error("Page access token resolution failed");
    }
    const tokenExpiresAt =
      longLivedPage.expiresIn != null
        ? new Date(this.now().getTime() + longLivedPage.expiresIn * 1000)
        : null;

    await this.deps.channelConnectionRepository.storeEncryptedCredential({
      tenantId: auth.tenantId,
      connectionId: connection.id,
      provider: "FACEBOOK",
      credentialType: "ACCESS_TOKEN",
      plaintextSecret: longLivedPage.accessToken,
      tokenExpiresAt,
      credentialState: "SET"
    });

    // Drop stale reconnect/health error fields so Assisted Connection shows CONNECTING,
    // not NEEDS_RECONNECT, until operational health finishes. Preserve lastHealthCheckAt.
    try {
      await this.deps.channelConnectionRepository.updateHealthFields({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        lastErrorCode: null,
        lastErrorMessageSafe: null
      });
    } catch {
      // Non-blocking; status derive no longer treats AUTHORIZING stale codes as reconnect.
    }

    // Subscribe Page to this Meta app and GET-verify required Messenger + feed webhook fields
    // (union-preserving repair — must not wipe existing fields such as feed).
    let subscriptionMessage =
      "Page connected. Run operational validation to finish setup.";
    let subscriptionErrorCategory: OAuthErrorCategory | null = null;
    try {
      if (!this.config.appId) {
        throw new FacebookGraphOAuthError(
          FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed,
          "UNKNOWN"
        );
      }
      await subscribeAndVerifyFacebookPageWebhook({
        graphVersion: this.config.graphVersion,
        pageId: graphPage.pageId,
        pageAccessToken: longLivedPage.accessToken,
        expectedAppId: this.config.appId
      });
      try {
        await this.deps.channelConnectionRepository.updateWebhookStatus({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          webhookActive: true,
          webhookEndpoint: `${(process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").replace(/\/$/, "")}/api/webhook/facebook`
        });
      } catch {
        // Token already stored; webhook flag is best-effort bookkeeping.
      }
      try {
        await this.deps.channelConnectionRepository.updateHealthFields({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          lastHealthCheckAt: this.now(),
          lastErrorCode: null,
          lastErrorMessageSafe: null
        });
      } catch {
        // Non-blocking; health POST remains the READY gate.
      }
    } catch (error) {
      const message =
        error instanceof FacebookGraphOAuthError
          ? sanitizeProviderErrorMessage(error.message)
          : FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.subscribeFailed;
      subscriptionMessage = message;
      subscriptionErrorCategory =
        error instanceof FacebookGraphOAuthError ? error.category : "TOKEN_EXCHANGE_FAILED";
      try {
        await this.deps.channelConnectionRepository.updateWebhookStatus({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          webhookActive: false
        });
      } catch {
        // Keep AUTHORIZING + token; operator can retry via health.
      }
      try {
        await this.deps.channelConnectionRepository.updateHealthFields({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          lastHealthCheckAt: this.now(),
          lastErrorCode: subscriptionErrorCategory,
          lastErrorMessageSafe: message
        });
      } catch {
        // Token remains; status DTO will still return CONNECTING until health passes.
      }
    }

    const completedAt = this.now();
    const isReauthorize = transaction.intent === "REAUTHORIZE";

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
      status: isReauthorize ? "READY" : "AUTHORIZING",
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
      connectionStatus: isReauthorize ? "READY" : "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: isReauthorize ? "OK" : "UNKNOWN",
      displayState: isReauthorize ? "CONNECTED" : "CONNECTING",
      reconnectRequired: false,
      providerPageId: graphPage.pageId,
      providerPageName: graphPage.name,
      message: isReauthorize
        ? "Facebook re-authorization succeeded. Linked Page is unchanged. Run a health check separately to refresh capability details — this is not an inbound/outbound smoke test."
        : subscriptionMessage
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

    // Bookkeeping only: webhook subscription is verified inside PAGE_WEBHOOK_SUBSCRIPTION.
    if (result.healthStatus === "OK" && result.checks.every((c) => c.status === "PASS")) {
      try {
        await this.deps.channelConnectionRepository.updateWebhookStatus({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          webhookActive: true,
          webhookEndpoint: `${(process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").replace(/\/$/, "")}/api/webhook/facebook`
        });
      } catch {
        // Health already passed; bookkeeping flag can be retried later.
      }
    } else if (
      result.checks.some(
        (c) => c.code === "PAGE_WEBHOOK_SUBSCRIPTION" && c.status === "FAIL"
      )
    ) {
      try {
        await this.deps.channelConnectionRepository.updateWebhookStatus({
          tenantId: auth.tenantId,
          connectionId: connection.id,
          webhookActive: false
        });
      } catch {
        // Persist failure via health fields already stored above.
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

    // Clear stale reconnect errors so status/display leave NEEDS_RECONNECT immediately.
    // Do not rewrite lastHealthCheckAt (audit timestamp).
    try {
      await this.deps.channelConnectionRepository.updateHealthFields({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        lastErrorCode: null,
        lastErrorMessageSafe: null
      });
    } catch {
      // Non-blocking; derivePersistedHealthStatus no longer maps AUTHORIZING + stale code → reconnect.
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
      expiresAt,
      intent: "RECONNECT",
      expectedPageId: connection.providerPageId
    });

    const authorizeUrl = buildFacebookOAuthAuthorizeUrl({
      config: this.graphConfig(),
      state,
      scopes: facebookOAuthScopes()
    });

    return { authorizeUrl, expiresAt: expiresAt.toISOString() };
  }

  async startReauthorize(auth: AuthContext): Promise<FacebookOAuthReauthorizeDto> {
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
    if (connection.provider !== "FACEBOOK") {
      throw new Error("Provider mismatch");
    }

    const credentialMetadata =
      await this.deps.channelConnectionRepository.listCredentialMetadataByConnection(
        auth.tenantId,
        connection.id
      );
    if (!isOAuthManagedFacebookConnection(connection, credentialMetadata)) {
      throw new Error("Facebook OAuth connection is not established");
    }

    const expectedPageId = connection.providerPageId?.trim() ?? "";
    if (!expectedPageId) {
      throw new Error("Linked Facebook Page is required for re-authorization");
    }

    if (connection.status !== "READY" && connection.status !== "AUTHORIZING") {
      throw new Error("Facebook connection is not ready for re-authorization");
    }

    await this.deps.oauthTransactionRepository.expireActiveTransactionsForConnection(
      auth.tenantId,
      connection.id
    );

    if (connection.status === "READY") {
      await this.deps.channelConnectionRepository.updateLifecycleStatus({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        status: "AUTHORIZING",
        connectedBy: auth.salesAgentId,
        allowReadyReauthorize: true
      });
    }

    // Do not clear or deactivate existing credentials before callback success.
    try {
      await this.deps.channelConnectionRepository.updateHealthFields({
        tenantId: auth.tenantId,
        connectionId: connection.id,
        lastErrorCode: null,
        lastErrorMessageSafe: null
      });
    } catch {
      // Non-blocking.
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
      expiresAt,
      intent: "REAUTHORIZE",
      expectedPageId
    });

    const authorizeUrl = buildFacebookOAuthAuthorizeUrl({
      config: this.graphConfig(),
      state,
      scopes: facebookOAuthScopes(),
      authTypeRerequest: true
    });

    return { authorizeUrl, expiresAt: expiresAt.toISOString(), expectedPageId };
  }

  sanitizeOperatorMessage(message: string): string {
    return sanitizeProviderErrorMessage(message);
  }
}
