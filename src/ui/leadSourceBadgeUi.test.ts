import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const leadsSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
const workQueueSource = readFileSync(new URL("./workQueueUi.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("dashboard inbox row renders lead source badge", () => {
  assert.equal(dashboardSource.includes("LeadSourceBadge"), true);
  assert.equal(dashboardSource.includes("conversation-list-source-row"), true);
});

test("chat header shows lead source badge and no raw provider_thread_type meta line", () => {
  assert.equal(dashboardSource.includes('data-testid="chat-header-lead-source"'), true);
  assert.equal(dashboardSource.match(/conv-header-meta-line[\s\S]{0,120}provider_thread_type/) != null, false);
});

test("context details panel includes lead source field", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-lead-source"'), true);
  assert.equal(dashboardSource.includes("<dt>Lead source</dt>"), true);
});

test("leads page uses PR #196 sourceType fields", () => {
  assert.equal(leadsSource.includes("LeadSourceBadge"), true);
  assert.equal(leadsSource.includes("sourceType"), true);
  assert.equal(leadsSource.includes("leadSourceClassification"), false);
});

test("work queue uses channel badge only until Workflow API adds source fields", () => {
  assert.equal(workQueueSource.includes("WorkQueueChannelBadge"), true);
  assert.equal(workQueueSource.includes("LeadSourceBadge"), false);
  assert.equal(workQueueSource.includes("lead_source_classification"), false);
});

test("globals.css defines lead source badge styles", () => {
  assert.match(globalsCss, /\.lead-source-badge\s*\{/);
  assert.match(globalsCss, /\.lead-source-badge-facebook-dm\s*\{/);
  assert.match(globalsCss, /\.lead-source-badge-unknown\s*\{/);
});
