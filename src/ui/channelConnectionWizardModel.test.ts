import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWizardCardsFromChannelSettingsFallback,
  buildWizardCardFromSetupStatusItem,
  canAccessChannelConnectionWizard,
  formatMissingSetupStepLabel,
  isUnsafeWizardConnectionLabel,
  parseChannelSetupStatusResponse,
  resolveWizardCards,
  resolveWizardDataScopeMessage,
  resolveWizardWebhookDisplayUrl,
  wizardCardViewIsSafe,
  wizardStatusLabel
} from "./channelConnectionWizardModel.js";
import type { ChannelSetupStatusItemDto } from "../domain/channelSetupStatus.js";
import type { ChannelSettingView } from "./channelSettingsModel.js";

const sampleSetupStatusBody = {
  data: [
    {
      channel: "LINE",
      setupStatus: "not_configured",
      connectionLabel: null,
      credentialsPresent: { accessToken: false, channelSecret: false, allRequiredPresent: false },
      testConnectionAvailable: false,
      webhookCallbackUrl: "/api/webhook/line",
      missingSetupSteps: ["ENABLE_CHANNEL", "SET_ACCESS_TOKEN", "SET_CHANNEL_SECRET"],
      activeConnectionScope: {
        hasActiveConnection: false,
        activeConnectionCount: 0,
        scopeBucket: "none",
        maskedProviderIdentity: "5418…len=15"
      },
      enabled: false,
      lastVerifiedAt: null,
      safeLastError: null
    },
    {
      channel: "FACEBOOK",
      setupStatus: "ready",
      connectionLabel: "Customer FB Page",
      credentialsPresent: {
        accessToken: true,
        appSecret: true,
        verifyToken: true,
        allRequiredPresent: true
      },
      testConnectionAvailable: true,
      webhookCallbackUrl: "https://hub.example.test/api/webhook/facebook",
      missingSetupSteps: [],
      activeConnectionScope: {
        hasActiveConnection: true,
        activeConnectionCount: 1,
        scopeBucket: "active",
        maskedProviderIdentity: "5418…len=15"
      },
      enabled: true,
      lastVerifiedAt: "2026-06-01T10:00:00.000Z",
      safeLastError: null
    },
    {
      channel: "INSTAGRAM",
      setupStatus: "needs_attention",
      connectionLabel: "Instagram Account",
      credentialsPresent: {
        accessToken: true,
        appSecret: false,
        verifyToken: true,
        allRequiredPresent: false
      },
      testConnectionAvailable: false,
      webhookCallbackUrl: "/api/webhook/instagram",
      missingSetupSteps: ["SET_APP_SECRET", "RESOLVE_CONNECTION_ERROR"],
      enabled: true,
      lastVerifiedAt: null,
      safeLastError: "Token validation failed"
    }
  ]
};

function lineRow(overrides: Partial<ChannelSettingView> = {}): ChannelSettingView {
  return {
    channel: "LINE",
    enabled: true,
    configured: true,
    status: "READY",
    providerPageId: null,
    providerAccountName: "SmartKorp LINE OA",
    lastVerifiedAt: "2026-06-01T10:00:00.000Z",
    lastError: null,
    updatedAt: "2026-06-01T09:00:00.000Z",
    secretState: { accessToken: "SET", channelSecret: "SET" },
    ...overrides
  };
}

test("parseChannelSetupStatusResponse maps setupStatus and fields from ACW-1A API", () => {
  const parsed = parseChannelSetupStatusResponse(sampleSetupStatusBody, "https://hub.example.com");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.cards.length, 3);
  assert.equal(parsed.cards[0]?.setupStatus, "not_configured");
  assert.equal(parsed.cards[0]?.statusLabel, "Not connected");
  assert.equal(parsed.cards[1]?.setupStatus, "ready");
  assert.equal(parsed.cards[1]?.connectionLabel, "Customer FB Page");
  assert.equal(parsed.cards[1]?.supportsTestConnection, true);
  assert.equal(parsed.cards[2]?.supportsTestConnection, false);
  assert.deepEqual(parsed.cards[0]?.missingSteps, [
    "Enable channel",
    "Set access token",
    "Set channel secret"
  ]);
  assert.match(parsed.cards[2]?.lastStatusText ?? "", /Token validation failed/);
});

test("resolveWizardWebhookDisplayUrl prefixes relative callback paths", () => {
  assert.equal(
    resolveWizardWebhookDisplayUrl("/api/webhook/line", "https://hub.example.com"),
    "https://hub.example.com/api/webhook/line"
  );
  assert.equal(
    resolveWizardWebhookDisplayUrl("https://hub.example.test/api/webhook/facebook", "https://hub.example.com"),
    "https://hub.example.test/api/webhook/facebook"
  );
});

test("wizard cards do not expose maskedProviderIdentity or raw provider ids", () => {
  const parsed = parseChannelSetupStatusResponse(sampleSetupStatusBody, "https://hub.example.com");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  for (const card of parsed.cards) {
    assert.equal(wizardCardViewIsSafe(card), true);
    assert.equal(String(card.connectionLabel).includes("5418"), false);
    assert.equal(JSON.stringify(card).includes("maskedProviderIdentity"), false);
    assert.equal(JSON.stringify(card).includes("…len="), false);
  }
});

test("resolveWizardCards prefers setup-status API over channel-settings fallback", () => {
  const fromFallback = resolveWizardCards({
    baseUrl: "https://hub.example.com",
    channelSettingsRows: [lineRow()]
  });
  assert.equal(fromFallback[0]?.setupStatus, "ready");

  const fromApi = resolveWizardCards({
    baseUrl: "https://hub.example.com",
    channelSettingsRows: [lineRow()],
    setupStatusApiBody: sampleSetupStatusBody
  });
  assert.equal(fromApi[0]?.setupStatus, "not_configured");
  assert.equal(fromApi[1]?.webhookUrl, "https://hub.example.test/api/webhook/facebook");
});

test("LINE API item changes do not alter Facebook card from same response", () => {
  const baseline = parseChannelSetupStatusResponse(sampleSetupStatusBody, "https://hub.example.com");
  assert.equal(baseline.ok, true);
  if (!baseline.ok) return;

  const mutated = parseChannelSetupStatusResponse(
    {
      data: sampleSetupStatusBody.data.map((row) =>
        row.channel === "LINE"
          ? { ...row, setupStatus: "disconnected", connectionLabel: "Old LINE OA" }
          : row
      )
    },
    "https://hub.example.com"
  );
  assert.equal(mutated.ok, true);
  if (!mutated.ok) return;

  assert.equal(baseline.cards[1]?.setupStatus, mutated.cards[1]?.setupStatus);
  assert.equal(baseline.cards[1]?.connectionLabel, mutated.cards[1]?.connectionLabel);
  assert.notEqual(baseline.cards[0]?.setupStatus, mutated.cards[0]?.setupStatus);
});

test("formatMissingSetupStepLabel maps API step codes", () => {
  assert.equal(formatMissingSetupStepLabel("SET_ACCESS_TOKEN"), "Set access token");
  assert.equal(formatMissingSetupStepLabel("RUN_TEST_CONNECTION"), "Run test connection");
});

test("wizard status labels cover lifecycle states", () => {
  assert.equal(wizardStatusLabel("not_configured"), "Not connected");
  assert.equal(wizardStatusLabel("configured"), "Configured");
  assert.equal(wizardStatusLabel("ready"), "Ready");
  assert.equal(wizardStatusLabel("needs_attention"), "Needs attention");
  assert.equal(wizardStatusLabel("disconnected"), "Disconnected");
});

test("isUnsafeWizardConnectionLabel rejects numeric ids and masked patterns", () => {
  assert.equal(isUnsafeWizardConnectionLabel("1137356672785125"), true);
  assert.equal(isUnsafeWizardConnectionLabel("5418…len=15"), true);
  assert.equal(isUnsafeWizardConnectionLabel("Acme Retail Page"), false);
});

test("canAccessChannelConnectionWizard is ADMIN only", () => {
  assert.equal(canAccessChannelConnectionWizard("ADMIN"), true);
  assert.equal(canAccessChannelConnectionWizard("MANAGER"), false);
  assert.equal(canAccessChannelConnectionWizard("SALES"), false);
});

test("channel-settings fallback builds cards when setup-status unavailable", () => {
  const cards = buildWizardCardsFromChannelSettingsFallback(
    [lineRow(), lineRow({ channel: "FACEBOOK", status: "NOT_CONFIGURED", configured: false, secretState: { accessToken: "EMPTY" } })],
    "https://hub.example.com"
  );
  assert.equal(cards.length, 3);
  assert.equal(cards[0]?.setupStatus, "ready");
});

test("buildWizardCardFromSetupStatusItem uses webhookCallbackUrl when present", () => {
  const item: ChannelSetupStatusItemDto = {
    channel: "LINE",
    setupStatus: "configured",
    connectionLabel: "LINE OA",
    credentialsPresent: { accessToken: true, channelSecret: true, allRequiredPresent: true },
    testConnectionAvailable: true,
    webhookCallbackUrl: "/api/webhook/line",
    missingSetupSteps: ["RUN_TEST_CONNECTION"],
    activeConnectionScope: {
      hasActiveConnection: false,
      activeConnectionCount: 0,
      scopeBucket: "none",
      maskedProviderIdentity: null
    },
    channelSettingsStatus: "NOT_CONFIGURED",
    connectionPlatformStatus: null,
    enabled: true,
    lastVerifiedAt: null,
    safeLastError: null
  };
  const card = buildWizardCardFromSetupStatusItem(item, "https://hub.example.com");
  assert.equal(card.webhookUrl, "https://hub.example.com/api/webhook/line");
  assert.equal(card.supportsTestConnection, true);
});

test("resolveWizardDataScopeMessage mentions disconnected history filters", () => {
  const message = resolveWizardDataScopeMessage();
  assert.match(message.body, /active connections by default/i);
  assert.match(message.adminHint, /Include disconnected/i);
});
