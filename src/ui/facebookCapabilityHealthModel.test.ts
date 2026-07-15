import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFacebookCapabilityHealthSections,
  deriveFacebookCapabilityOverallState,
  filterKnownReadinessChecks,
  formatFacebookCapabilityPageLabel,
  shouldShowFacebookCapabilityReauthorize,
  shouldShowFacebookCapabilityRunHealth,
  type BuildFacebookCapabilityHealthInput
} from "./facebookCapabilityHealthModel.js";
import {
  READINESS_CHECK_CODES,
  type FacebookConnectStatus,
  type HealthCheck
} from "./facebookConnectModel.js";

const cardSource = readFileSync(new URL("./FacebookConnectCard.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./FacebookCapabilityHealthPanel.tsx", import.meta.url), "utf8");

function passChecks(): HealthCheck[] {
  return READINESS_CHECK_CODES.map((code) => ({
    code,
    status: "PASS" as const,
    message: `${code} ok`
  }));
}

function baseStatus(overrides: Partial<FacebookConnectStatus> = {}): FacebookConnectStatus {
  return {
    connectionId: "conn-1",
    connectionStatus: "READY",
    displayState: "CONNECTED",
    oauthStage: "COMPLETED",
    healthStatus: "OK",
    reconnectRequired: false,
    providerPageId: "657955874072241",
    providerPageName: "Connex Demo Page",
    manualConfigured: false,
    oauthAvailable: true,
    lastCheckedAt: "2026-07-15T08:00:00.000Z",
    lastVerifiedAt: null,
    errorCategory: null,
    message: null,
    credentialState: { pageAccessToken: "SET" },
    ...overrides
  };
}

function modelInput(
  overrides: Partial<BuildFacebookCapabilityHealthInput> = {}
): BuildFacebookCapabilityHealthInput {
  return {
    status: baseStatus(),
    presentationState: "CONNECTED",
    healthChecks: passChecks(),
    healthResult: {
      healthStatus: "OK",
      reconnectRequired: false,
      connectionStatus: "READY",
      displayState: "CONNECTED",
      lastCheckedAt: "2026-07-15T08:00:00.000Z",
      errorCategory: null,
      message: null,
      checks: passChecks()
    },
    healthChecking: false,
    ...overrides
  };
}

test("READY alone without health evidence is not HEALTHY", () => {
  assert.equal(
    deriveFacebookCapabilityOverallState(
      modelInput({
        healthChecks: [],
        healthResult: null,
        status: baseStatus({ connectionStatus: "READY", healthStatus: "OK", displayState: "CONNECTED" }),
        presentationState: "CONNECTED"
      })
    ),
    "UNKNOWN"
  );
});

test("CONNECTED + health OK + all required checks PASS is HEALTHY", () => {
  assert.equal(deriveFacebookCapabilityOverallState(modelInput()), "HEALTHY");
});

test("PAGE_WEBHOOK_SUBSCRIPTION FAIL yields NEEDS ATTENTION and grouped comment/messenger failure", () => {
  const checks = passChecks().map((check) =>
    check.code === "PAGE_WEBHOOK_SUBSCRIPTION"
      ? { ...check, status: "FAIL" as const, message: "Page webhook subscription is incomplete." }
      : check
  );
  const input = modelInput({ healthChecks: checks, healthResult: null });
  assert.equal(deriveFacebookCapabilityOverallState(input), "NEEDS_ATTENTION");
  const sections = buildFacebookCapabilityHealthSections(input);
  const messenger = sections.find((section) => section.id === "messenger");
  const comments = sections.find((section) => section.id === "comments");
  assert.equal(messenger?.status, "FAIL");
  assert.equal(comments?.status, "FAIL");
  assert.equal(messenger?.items.every((item) => item.status === "FAIL"), true);
  assert.equal(comments?.items.find((item) => item.key === "feed")?.status, "FAIL");
});

test("reconnectRequired true yields NEEDS ATTENTION and reauthorize action", () => {
  assert.equal(
    deriveFacebookCapabilityOverallState(
      modelInput({
        status: baseStatus({ reconnectRequired: true, healthStatus: "RECONNECT_REQUIRED" }),
        presentationState: "NEEDS_RECONNECT",
        healthChecks: []
      })
    ),
    "NEEDS_ATTENTION"
  );
  assert.equal(
    shouldShowFacebookCapabilityReauthorize({
      oauthAvailable: true,
      healthActionEnabled: true,
      presentationState: "NEEDS_RECONNECT",
      reconnectRequired: true
    }),
    true
  );
});

test("AUTHORIZING lifecycle yields CHECKING", () => {
  assert.equal(
    deriveFacebookCapabilityOverallState(
      modelInput({
        presentationState: "CONNECTING",
        status: baseStatus({ connectionStatus: "AUTHORIZING", healthStatus: "UNKNOWN" }),
        healthChecks: []
      })
    ),
    "CHECKING"
  );
});

test("no connection yields UNKNOWN presentation", () => {
  assert.equal(
    deriveFacebookCapabilityOverallState(
      modelInput({
        presentationState: "NOT_CONNECTED",
        status: baseStatus({
          connectionId: null,
          connectionStatus: null,
          providerPageId: null,
          providerPageName: null,
          healthStatus: "UNKNOWN"
        }),
        healthChecks: []
      })
    ),
    "UNKNOWN"
  );
});

test("unknown health check code does not crash section builder", () => {
  const checks: HealthCheck[] = [
    ...passChecks(),
    { code: "FUTURE_CHECK", status: "FAIL", message: "future failure" }
  ];
  const sections = buildFacebookCapabilityHealthSections(modelInput({ healthChecks: checks }));
  assert.equal(sections.length, 6);
  assert.equal(filterKnownReadinessChecks(checks).length, READINESS_CHECK_CODES.length);
  assert.equal(deriveFacebookCapabilityOverallState(modelInput({ healthChecks: checks })), "HEALTHY");
});

test("health API failure surfaces safe actionable copy in panel wiring", () => {
  assert.ok(panelSource.includes('data-testid="facebook-capability-health-error"'));
  assert.ok(cardSource.includes("setHealthError"));
  assert.ok(cardSource.includes("You are not authorized to run Facebook health checks."));
  assert.ok(cardSource.includes("Health check failed. Try again"));
});

test("Run Health Check calls endpoint once and disables while pending", () => {
  assert.ok(panelSource.includes('data-testid="facebook-run-health-check"'));
  assert.ok(panelSource.includes("disabled={disabled || healthChecking}"));
  assert.ok(cardSource.includes("if (validationBusy || disabled || !healthActionEnabled) return"));
  assert.ok(cardSource.includes("void loadStatus()"));
  assert.equal(cardSource.match(/FACEBOOK_CONNECT_API\.health/g)?.length, 1);
});

test("unauthorized role hides health action", () => {
  assert.equal(
    shouldShowFacebookCapabilityRunHealth({
      healthActionEnabled: false,
      oauthAvailable: true,
      disabled: false,
      statusLoaded: true,
      hasConnection: true
    }),
    false
  );
  assert.ok(panelSource.includes("shouldShowFacebookCapabilityRunHealth"));
});

test("Connex healthy fixture remains HEALTHY", () => {
  const input = modelInput({
    status: baseStatus({
      providerPageId: "657955874072241",
      providerPageName: "Connex Demo Page"
    })
  });
  assert.equal(deriveFacebookCapabilityOverallState(input), "HEALTHY");
});

test("SmartKorp production-shaped healthy fixture is HEALTHY", () => {
  const input = modelInput({
    status: baseStatus({
      providerPageId: "111222333444555",
      providerPageName: "SmartKorp"
    })
  });
  assert.equal(deriveFacebookCapabilityOverallState(input), "HEALTHY");
  const messenger = buildFacebookCapabilityHealthSections(input).find((s) => s.id === "messenger");
  const comments = buildFacebookCapabilityHealthSections(input).find((s) => s.id === "comments");
  assert.equal(messenger?.status, "PASS");
  assert.equal(comments?.status, "PASS");
});

test("missing Page name uses safe fallback label", () => {
  assert.equal(
    formatFacebookCapabilityPageLabel({ providerPageName: null, providerPageId: "657955874072241" }),
    "Page ID 657955874072241"
  );
  const sections = buildFacebookCapabilityHealthSections(
    modelInput({
      status: baseStatus({ providerPageName: null })
    })
  );
  const connection = sections.find((section) => section.id === "connection");
  assert.equal(connection?.items.find((item) => item.key === "page")?.hint, "Page ID 657955874072241");
});

test("panel and card do not render raw provider secrets", () => {
  for (const source of [cardSource, panelSource, readFileSync(new URL("./facebookCapabilityHealthModel.ts", import.meta.url), "utf8")]) {
    assert.equal(source.includes("access_token"), false);
    assert.equal(source.includes("EAA"), false);
    assert.equal(source.includes("encrypted_secret"), false);
  }
  assert.ok(panelSource.includes("sanitizeFacebookConnectMessage") || cardSource.includes("sanitizeFacebookConnectMessage"));
});

test("FacebookConnectCard integrates capability panel below assisted connection", () => {
  assert.ok(cardSource.includes("FacebookCapabilityHealthPanel"));
  assert.ok(panelSource.includes('data-testid="facebook-capability-health"'));
  assert.equal(cardSource.includes('data-testid="facebook-health-checks"'), false);
});

test("capability model groups subscription fields without inventing per-field API evidence", () => {
  const sections = buildFacebookCapabilityHealthSections(modelInput());
  const messenger = sections.find((section) => section.id === "messenger");
  assert.equal(messenger?.items.length, 5);
  assert.equal(
    messenger?.items.every((item) => item.hint === "Verified via Page webhook subscription"),
    true
  );
});
