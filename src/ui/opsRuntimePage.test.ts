import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opsPageSource = readFileSync(new URL("./OpsRuntimePage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamMembersSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

test("Ops Runtime page uses ops-runtime-root layout and fetches /api/ops/runtime", () => {
  assert.equal(opsPageSource.includes('className="ops-runtime-root"'), true);
  assert.equal(opsPageSource.includes('data-testid="ops-runtime-page"'), true);
  assert.equal(opsPageSource.includes("/api/ops/runtime"), true);
  assert.equal(opsPageSource.includes("parseOpsRuntimeResponse"), true);
});

test("Ops Runtime page is ADMIN-only and does not auto-poll", () => {
  assert.equal(opsPageSource.includes('meContext.role !== "ADMIN"'), true);
  assert.equal(opsPageSource.includes('data-testid="ops-runtime-access-denied"'), true);
  assert.equal(opsPageSource.includes("setInterval"), false);
  assert.equal(opsPageSource.includes("DashboardConversationPollScheduler"), false);
});

test("Ops Runtime copy clarifies global operational health", () => {
  assert.match(opsPageSource, /not tenant sales metrics/i);
  assert.match(opsPageSource, /global/i);
});

test("Ops nav link is ADMIN-only on dashboard and team members", () => {
  assert.equal(dashboardSource.includes('data-testid="nav-ops-runtime"'), true);
  assert.equal(teamMembersSource.includes('data-testid="nav-ops-runtime"'), true);
  assert.equal(dashboardSource.includes('meContext?.role === "ADMIN"'), true);
  const dashOpsIdx = dashboardSource.indexOf('data-testid="nav-ops-runtime"');
  const dashAdminIdx = dashboardSource.lastIndexOf('meContext?.role === "ADMIN"', dashOpsIdx);
  assert.ok(dashAdminIdx >= 0 && dashAdminIdx < dashOpsIdx);
});

test("globals.css shares team-members rail grid and tokens with ops-runtime-root", () => {
  const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(
    globalsCss,
    /\.ops-runtime-root,\s*\n\.channel-settings-root,\s*\n\.leads-root\s*\{[^}]*--app-rail-width:\s*64px/s
  );
  assert.match(
    globalsCss,
    /\.ops-runtime-root,\s*\n\.channel-settings-root\s*\{[^}]*grid-template-columns:\s*var\(--app-rail-width\)\s*minmax\(0,\s*1fr\)/s
  );
});

test("Ops Runtime page renders retention dry-run section for ADMIN", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run"'), true);
  assert.equal(opsPageSource.includes("Retention dry-run"), true);
  assert.equal(opsPageSource.includes("/api/retention/dry-run"), true);
  assert.equal(opsPageSource.includes("parseRetentionDryRunResponse"), true);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run-reload"'), true);
});

test("Retention dry-run copy states no data will be deleted", () => {
  assert.match(opsPageSource, /Dry-run only\. No data will be deleted\./);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run-disclaimer"'), true);
});

test("Retention dry-run shows summary and sample tables without destructive actions", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run-summary"'), true);
  assert.equal(opsPageSource.includes("Media purge candidates"), true);
  assert.equal(opsPageSource.includes('testId="ops-retention-media-samples"'), true);
  assert.equal(opsPageSource.includes('testId="ops-retention-message-samples"'), true);
  assert.equal(opsPageSource.includes("sanitizeRetentionDryRunSampleRow"), false);
  assert.equal(opsPageSource.includes("Delete"), false);
  assert.equal(/>\s*Purge\s*</.test(opsPageSource), false);
  assert.equal(/>\s*Confirm\s*</.test(opsPageSource), false);
  assert.match(opsPageSource, /purge candidates/i);
  assert.equal(opsPageSource.includes('onClick={() => void loadRetentionDryRun()}'), true);
});

test("Retention dry-run handles API unavailable safely", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run-unavailable"'), true);
  assert.equal(opsPageSource.includes("retentionUnavailable"), true);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-dry-run-error"'), true);
});

test("Non-admin Ops access remains restricted", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-runtime-access-denied"'), true);
  assert.equal(opsPageSource.includes('meContext.role !== "ADMIN"'), true);
});

test("Ops Runtime page renders retention audit snapshots section", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-retention-audit-snapshots"'), true);
  assert.equal(opsPageSource.includes("Retention audit snapshots"), true);
  assert.equal(opsPageSource.includes("/api/retention/purge-runs"), true);
  assert.equal(opsPageSource.includes("parseRetentionPurgeRunsListResponse"), true);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-save-snapshot"'), true);
  assert.equal(opsPageSource.includes("Save dry-run snapshot"), true);
});

test("Retention audit copy states no data will be deleted", () => {
  assert.match(opsPageSource, /Audit snapshot only\. No data will be deleted\./);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-audit-disclaimer"'), true);
});

test("Save dry-run snapshot POSTs notes-only body without purge execution", () => {
  assert.equal(opsPageSource.includes('method: "POST"'), true);
  assert.match(opsPageSource, /apiFetch\("\/api\/retention\/purge-runs"/);
  assert.equal(
    opsPageSource.includes("buildRetentionPurgeRunSnapshotBody(retentionReport, snapshotNotes)"),
    false
  );
  assert.equal(opsPageSource.includes("buildRetentionPurgeRunSnapshotBody(snapshotNotes)"), true);
  assert.equal(opsPageSource.includes("saveDryRunSnapshot"), true);
});

test("Retention audit history loads from GET purge-runs", () => {
  assert.equal(opsPageSource.includes("loadPurgeRuns"), true);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-audit-history"'), true);
  assert.equal(opsPageSource.includes("RetentionPurgeRunHistoryItem"), true);
  assert.equal(opsPageSource.includes("archivedMediaRetentionDays"), true);
  assert.equal(opsPageSource.includes("mediaPurgeCandidates"), true);
});

test("Retention audit has no destructive purge controls", () => {
  assert.equal(opsPageSource.includes("Execute"), false);
  assert.equal(/>\s*Confirm purge\s*</i.test(opsPageSource), false);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-audit-unavailable"'), true);
});

test("Retention audit handles errors safely", () => {
  assert.equal(opsPageSource.includes('data-testid="ops-retention-audit-error"'), true);
  assert.equal(opsPageSource.includes('data-testid="ops-retention-snapshot-error"'), true);
});
