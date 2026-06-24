import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("META-CRED-1D-B adds migration file only for activation RPC", () => {
  const migrations = readdirSync(join(repoRoot, "supabase/migrations"));
  assert.equal(
    migrations.filter((name) => name.includes("meta_cred_1d")).length,
    1
  );
  assert.equal(
    migrations.some((name) => name === "20260624120000_meta_cred_1d_activation_rpc.sql"),
    true
  );
});

test("activation adapter is not wired into runtime paths", () => {
  try {
    const output = execSync(
      'rg "SupabaseMetaPageCredentialActivationRepository" src --glob "!**/supabaseMetaPageCredentialActivationRepository.ts" --glob "!**/*.test.ts" -l',
      { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    assert.equal(output, "");
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return;
    throw error;
  }
});

test("rotation RPC is not present in 1D-B migration", () => {
  const content = readFileSync(
    join(repoRoot, "supabase/migrations/20260624120000_meta_cred_1d_activation_rpc.sql"),
    "utf8"
  );
  assert.doesNotMatch(content, /rotate_meta_page_credential_tx/i);
});
