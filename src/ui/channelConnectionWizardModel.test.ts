import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWizardCardFromChannelSetting,
  buildWizardCardsFromChannelSettings,
  canAccessChannelConnectionWizard,
  isUnsafeWizardConnectionLabel,
  resolveSafeWizardConnectionLabel,
  resolveWizardCards,
  resolveWizardDataScopeMessage,
  wizardCardViewIsSafe,
  wizardStatusLabel
} from "./channelConnectionWizardModel.js";
import type { ChannelSettingView } from "./channelSettingsModel.js";

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

function facebookRow(overrides: Partial<ChannelSettingView> = {}): ChannelSettingView {
  return {
    channel: "FACEBOOK",
    enabled: true,
    configured: false,
    status: "NOT_CONFIGURED",
    providerPageId: "1137356672785125",
    providerAccountName: "Acme Retail Page",
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: "2026-06-01T09:00:00.000Z",
    secretState: { accessToken: "EMPTY", appSecret: "EMPTY", verifyToken: "EMPTY" },
    ...overrides
  };
}

test("buildWizardCardsFromChannelSettings returns three independent channel cards", () => {
  const cards = buildWizardCardsFromChannelSettings(
    [
      lineRow(),
      facebookRow(),
      lineRow({
        channel: "INSTAGRAM",
        providerAccountName: "IG Shop",
        secretState: { accessToken: "EMPTY", verifyToken: "EMPTY", appSecret: "EMPTY" }
      })
    ],
    "https://hub.example.com"
  );
  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => c.channel),
    ["LINE", "FACEBOOK", "INSTAGRAM"]
  );
  assert.equal(cards[0]?.status, "READY");
  assert.equal(cards[1]?.status, "NOT_CONNECTED");
});

test("LINE card changes do not alter Facebook card state", () => {
  const cardsBefore = buildWizardCardsFromChannelSettings(
    [lineRow({ status: "READY" }), facebookRow()],
    "https://hub.example.com"
  );
  const cardsAfter = buildWizardCardsFromChannelSettings(
    [lineRow({ status: "ERROR", lastError: "LINE token invalid" }), facebookRow()],
    "https://hub.example.com"
  );
  assert.equal(cardsBefore[1]?.status, cardsAfter[1]?.status);
  assert.equal(cardsBefore[1]?.missingSteps.join(","), cardsAfter[1]?.missingSteps.join(","));
  assert.notEqual(cardsBefore[0]?.status, cardsAfter[0]?.status);
});

test("resolveSafeWizardConnectionLabel rejects raw page id and unsafe values", () => {
  assert.equal(
    resolveSafeWizardConnectionLabel({
      providerAccountName: "1137356672785125",
      providerPageId: "1137356672785125"
    }),
    null
  );
  assert.equal(isUnsafeWizardConnectionLabel("https://facebook.com/page"), true);
  assert.equal(
    resolveSafeWizardConnectionLabel({ providerAccountName: "Acme Retail Page" }),
    "Acme Retail Page"
  );
});

test("wizard status labels cover empty and ready states", () => {
  assert.equal(wizardStatusLabel("NOT_CONNECTED"), "Not connected");
  assert.equal(wizardStatusLabel("READY"), "Ready");
  assert.equal(wizardStatusLabel("NEEDS_ATTENTION"), "Needs attention");
  assert.equal(wizardStatusLabel("DISCONNECTED"), "Disconnected");

  const ready = buildWizardCardFromChannelSetting(lineRow(), "https://hub.example.com");
  assert.equal(ready.status, "READY");
  assert.equal(ready.missingSteps.length, 0);

  const empty = buildWizardCardFromChannelSetting(
    lineRow({
      configured: false,
      enabled: false,
      status: "NOT_CONFIGURED",
      secretState: { accessToken: "EMPTY", channelSecret: "EMPTY" }
    }),
    "https://hub.example.com"
  );
  assert.equal(empty.status, "NOT_CONNECTED");
  assert.ok(empty.missingSteps.length > 0);
});

test("canAccessChannelConnectionWizard is ADMIN only", () => {
  assert.equal(canAccessChannelConnectionWizard("ADMIN"), true);
  assert.equal(canAccessChannelConnectionWizard("MANAGER"), false);
  assert.equal(canAccessChannelConnectionWizard("SALES"), false);
});

test("wizard card view is safe and excludes secrets", () => {
  const card = buildWizardCardFromChannelSetting(lineRow(), "https://hub.example.com");
  assert.equal(wizardCardViewIsSafe(card), true);
  assert.equal(card.connectionLabel, "SmartKorp LINE OA");
  assert.equal(String(card.connectionLabel).includes("113735"), false);
});

test("resolveWizardDataScopeMessage mentions disconnected history filters", () => {
  const message = resolveWizardDataScopeMessage();
  assert.match(message.body, /active connections by default/i);
  assert.match(message.adminHint, /Include disconnected/i);
  assert.match(message.adminHint, /deleted automatically/i);
});

test("resolveWizardCards prefers ACW API body when valid", () => {
  const fromSettings = resolveWizardCards({
    baseUrl: "https://hub.example.com",
    channelSettingsRows: [lineRow()]
  });
  assert.equal(fromSettings[0]?.status, "READY");

  const fromAcw = resolveWizardCards({
    baseUrl: "https://hub.example.com",
    channelSettingsRows: [lineRow()],
    acwApiBody: {
      data: [
        {
          channel: "LINE",
          setupStatus: "NEEDS_ATTENTION",
          connectionLabel: "LINE OA",
          missingSteps: ["Channel access token"],
          lastStatusText: "Waiting for test"
        }
      ]
    }
  });
  assert.equal(fromAcw[0]?.status, "NEEDS_ATTENTION");
  assert.equal(fromAcw[0]?.connectionLabel, "LINE OA");
});
