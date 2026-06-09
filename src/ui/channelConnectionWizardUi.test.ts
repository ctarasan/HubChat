import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modelSource = readFileSync(new URL("./channelConnectionWizardModel.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./ChannelConnectionWizardShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./ChannelConnectionWizardPanel.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("./ChannelConnectionWizardCard.tsx", import.meta.url), "utf8");
const settingsPageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");

test("wizard shell renders three channel cards", () => {
  assert.equal(shellSource.includes("channel-wizard-grid"), true);
  assert.equal(shellSource.includes("ChannelConnectionWizardCard"), true);
  assert.equal(modelSource.includes('WIZARD_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"]'), true);
});

test("wizard uses setup-status API as primary data source", () => {
  assert.equal(modelSource.includes("CHANNEL_SETUP_STATUS_API_PATH"), true);
  assert.equal(modelSource.includes("/api/channel-connections/setup-status"), true);
  assert.equal(modelSource.includes("parseChannelSetupStatusResponse"), true);
  assert.equal(modelSource.includes("buildWizardCardsFromChannelSettingsFallback"), true);
  assert.equal(shellSource.includes("setupStatusApiBody"), true);
  assert.equal(settingsPageSource.includes("/api/channel-connections/setup-status"), true);
});

test("wizard panel uses password inputs and test availability guard", () => {
  assert.equal(panelSource.includes('type="password"'), true);
  assert.equal(panelSource.includes("supportsTestConnection"), true);
  assert.equal(panelSource.includes("channel-wizard-test-unavailable"), true);
  assert.equal(panelSource.includes("channel-wizard-webhook-copy"), true);
});

test("wizard components do not expose raw provider id or masked identity as labels", () => {
  assert.equal(cardSource.includes("provider_page_id"), false);
  assert.equal(cardSource.includes("maskedProviderIdentity"), false);
  assert.equal(shellSource.includes("maskedProviderIdentity"), false);
  assert.match(modelSource, /never renders|Primary:|maskedProviderIdentity: null/i);
});

test("Channel Settings page embeds wizard shell for ADMIN", () => {
  assert.equal(settingsPageSource.includes("ChannelConnectionWizardShell"), true);
  assert.equal(settingsPageSource.includes("setupStatusBody"), true);
  assert.equal(settingsPageSource.includes("channel-settings-manual-heading"), true);
});
