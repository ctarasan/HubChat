import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("globals.css follows system color scheme with light root and dark media block", () => {
  assert.match(globalsCss, /:root\s*\{[^}]*color-scheme:\s*light/s);
  assert.match(globalsCss, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^}]*:root\s*\{[^}]*color-scheme:\s*dark/s);
});

test("globals.css defines core theme CSS variables for surfaces and text", () => {
  const requiredVars = [
    "--app-bg",
    "--surface-bg",
    "--surface-muted-bg",
    "--surface-elevated-bg",
    "--border-color",
    "--border-strong-color",
    "--text-primary",
    "--text-muted",
    "--accent-color",
    "--chat-inbound-bg",
    "--chat-outbound-bg",
    "--badge-sla-overdue-bg",
    "--badge-followup-today-bg",
  ];
  for (const name of requiredVars) {
    assert.match(globalsCss, new RegExp(`${name}:\\s*[^;]+;`));
  }
});

test("dashboard roots map inbox tokens to global theme variables", () => {
  assert.match(
    globalsCss,
    /\.dashboard-root,\s*\.team-members-root,\s*\.ops-runtime-root,\s*\.channel-settings-root,\s*\.sla-policy-root,\s*\.leads-root\s*\{[^}]*--inbox-text:\s*var\(--text-primary\)/s
  );
  assert.match(globalsCss, /--inbox-surface:\s*var\(--surface-muted-bg\)/);
});
