import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamMembersSalesAgentsUrl } from "./teamMembersListUrl.js";

test("team members list URL always sets includeInactive true", () => {
  assert.match(
    buildTeamMembersSalesAgentsUrl({ search: "", role: "all", status: "all", assignmentMode: "all" }),
    /includeInactive=true/
  );
});

test("team members list URL maps filters to expected query params", () => {
  const path = buildTeamMembersSalesAgentsUrl({
    search: "pat@ex.com",
    role: "MANAGER",
    status: "ACTIVE",
    assignmentMode: "PAUSED"
  });
  const url = new URL(path, "http://localhost");
  assert.equal(url.pathname, "/api/sales-agents");
  assert.equal(url.searchParams.get("includeInactive"), "true");
  assert.equal(url.searchParams.get("q"), "pat@ex.com");
  assert.equal(url.searchParams.get("role"), "MANAGER");
  assert.equal(url.searchParams.get("status"), "ACTIVE");
  assert.equal(url.searchParams.get("assignmentMode"), "PAUSED");
});

test("team members list URL omits optional params when filters are all", () => {
  const path = buildTeamMembersSalesAgentsUrl({
    search: "   ",
    role: "all",
    status: "all",
    assignmentMode: "all"
  });
  const url = new URL(path, "http://localhost");
  assert.equal(url.searchParams.has("q"), false);
  assert.equal(url.searchParams.has("role"), false);
  assert.equal(url.searchParams.has("status"), false);
  assert.equal(url.searchParams.has("assignmentMode"), false);
});
