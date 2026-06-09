import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modelSource = readFileSync(new URL("./channelConnectionWizardModel.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./ChannelConnectionWizardShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./ChannelConnectionWizardPanel.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("./ChannelConnectionWizardCard.tsx", import.meta.url), "utf8");
const settingsPageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("wizard shell renders three channel cards", () => {
  assert.equal(shellSource.includes("channel-wizard-grid"), true);
  assert.equal(shellSource.includes("ChannelConnectionWizardCard"), true);
  assert.equal(modelSource.includes('WIZARD_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"]'), true);
});

test("wizard panel uses password inputs and does not render secret values", () => {
  assert.equal(panelSource.includes('type="password"'), true);
  assert.equal(panelSource.includes("never displayed after save"), true);
  assert.equal(cardSource.includes("provider_page_id"), false);
  assert.equal(cardSource.includes("providerPageId"), false);
});

test("Channel Settings page embeds wizard shell for ADMIN", () => {
  assert.equal(settingsPageSource.includes("ChannelConnectionWizardShell"), true);
  assert.equal(settingsPageSource.includes('data-testid="channel-connection-wizard"'), false);
  assert.equal(shellSource.includes('data-testid="channel-connection-wizard"'), true);
  assert.equal(settingsPageSource.includes("channel-settings-manual-heading"), true);
});

test("wizard responsive grid layout class exists", () => {
  assert.match(cssSource, /\.channel-wizard-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/s);
});

test("wizard components do not expose raw provider id as connection label field", () => {
  assert.equal(shellSource.includes("providerPageId"), false);
  assert.equal(panelSource.includes("providerPageId"), false);
  assert.match(modelSource, /Must never|write-only|never renders/i);
});
