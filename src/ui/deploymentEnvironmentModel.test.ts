import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEPLOYMENT_ENV_PUBLIC_VAR,
  DEPLOYMENT_LABEL_PUBLIC_VAR,
  defaultDeploymentEnvironmentLabel,
  normalizeDeploymentEnvironmentKind,
  readDeploymentEnvironmentPresentation,
  sanitizeDeploymentEnvironmentLabel
} from "./deploymentEnvironmentModel.js";

const bannerSource = readFileSync(new URL("./DeploymentEnvironmentBanner.tsx", import.meta.url), "utf8");
const channelSettingsSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("normalizeDeploymentEnvironmentKind defaults absent or unknown to production", () => {
  assert.equal(normalizeDeploymentEnvironmentKind(undefined), "production");
  assert.equal(normalizeDeploymentEnvironmentKind(""), "production");
  assert.equal(normalizeDeploymentEnvironmentKind("production"), "production");
  assert.equal(normalizeDeploymentEnvironmentKind("PROD"), "production");
  assert.equal(normalizeDeploymentEnvironmentKind("unknown-env"), "production");
});

test("normalizeDeploymentEnvironmentKind recognizes non-production kinds", () => {
  assert.equal(normalizeDeploymentEnvironmentKind("staging"), "staging");
  assert.equal(normalizeDeploymentEnvironmentKind("preview"), "preview");
  assert.equal(normalizeDeploymentEnvironmentKind("development"), "development");
  assert.equal(normalizeDeploymentEnvironmentKind("dev"), "development");
  assert.equal(normalizeDeploymentEnvironmentKind("local"), "development");
});

test("readDeploymentEnvironmentPresentation returns null for production baseline", () => {
  assert.equal(readDeploymentEnvironmentPresentation({} as unknown as NodeJS.ProcessEnv), null);
  assert.equal(
    readDeploymentEnvironmentPresentation({
      [DEPLOYMENT_ENV_PUBLIC_VAR]: "production"
    } as unknown as NodeJS.ProcessEnv),
    null
  );
});

test("readDeploymentEnvironmentPresentation shows staging label and warning", () => {
  const presentation = readDeploymentEnvironmentPresentation({
    [DEPLOYMENT_ENV_PUBLIC_VAR]: "staging"
  } as unknown as NodeJS.ProcessEnv);
  assert.notEqual(presentation, null);
  if (presentation) {
    assert.equal(presentation.kind, "staging");
    assert.equal(presentation.label, "STAGING");
    assert.match(presentation.warning, /Test environment/i);
  }
});

test("readDeploymentEnvironmentPresentation distinguishes preview and development", () => {
  const preview = readDeploymentEnvironmentPresentation({
    [DEPLOYMENT_ENV_PUBLIC_VAR]: "preview"
  } as unknown as NodeJS.ProcessEnv);
  const development = readDeploymentEnvironmentPresentation({
    [DEPLOYMENT_ENV_PUBLIC_VAR]: "development"
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(preview?.label, "PREVIEW");
  assert.equal(development?.label, "DEVELOPMENT");
  assert.notEqual(preview?.warning, development?.warning);
});

test("readDeploymentEnvironmentPresentation accepts optional sanitized custom label", () => {
  const presentation = readDeploymentEnvironmentPresentation({
    [DEPLOYMENT_ENV_PUBLIC_VAR]: "staging",
    [DEPLOYMENT_LABEL_PUBLIC_VAR]: "OAuth Pilot Staging"
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(presentation?.label, "OAuth Pilot Staging");
});

test("sanitizeDeploymentEnvironmentLabel rejects secret-like custom labels", () => {
  assert.equal(sanitizeDeploymentEnvironmentLabel("EAAxxxxx"), null);
  assert.equal(sanitizeDeploymentEnvironmentLabel("supabase-staging"), null);
  assert.equal(sanitizeDeploymentEnvironmentLabel("https://user:pass@host"), null);
  assert.equal(sanitizeDeploymentEnvironmentLabel("Pilot A"), "Pilot A");
});

test("defaultDeploymentEnvironmentLabel uses uppercase non-production tokens", () => {
  assert.equal(defaultDeploymentEnvironmentLabel("staging"), "STAGING");
  assert.equal(defaultDeploymentEnvironmentLabel("preview"), "PREVIEW");
  assert.equal(defaultDeploymentEnvironmentLabel("development"), "DEVELOPMENT");
});

test("DeploymentEnvironmentBanner uses role=status and test ids without dumping env", () => {
  assert.ok(bannerSource.includes('data-testid="deployment-environment-banner"'));
  assert.ok(bannerSource.includes('role="status"'));
  assert.ok(bannerSource.includes("aria-label"));
  assert.equal(bannerSource.includes("process.env"), false);
  assert.equal(bannerSource.includes("JSON.stringify"), false);
});

test("Channel Settings includes deployment environment banner before OAuth section", () => {
  assert.ok(channelSettingsSource.includes("DeploymentEnvironmentBanner"));
  const mainOpen = channelSettingsSource.indexOf('className="channel-settings-main"');
  const bannerRender = channelSettingsSource.indexOf("<DeploymentEnvironmentBanner />");
  const facebookRender = channelSettingsSource.indexOf("<FacebookConnectCard");
  assert.ok(mainOpen >= 0 && bannerRender > mainOpen);
  assert.ok(bannerRender > 0 && facebookRender > bannerRender);
});

test("globals.css includes responsive deployment environment banner rules", () => {
  assert.ok(globalsSource.includes(".deployment-environment-banner"));
  assert.ok(globalsSource.includes("@media (max-width: 390px)"));
});
