import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = join(repoRoot, "supabase/migrations");

test("META-CRED-1D-A provider verification adds no supabase migration files", () => {
  assert.equal(existsSync(migrationsDir), true);
  const migrations = readdirSync(migrationsDir);
  assert.equal(
    migrations.some((name) => /meta_cred_1d-a|meta_cred_1d_a_/i.test(name)),
    false
  );
});

test("verify meta page credential use case is not wired into runtime paths", () => {
  try {
    const output = execSync(
      'rg "VerifyMetaPageCredentialUseCase|verifyMetaPageCredential" src --glob "!**/metaPageCredentialVerification/**" --glob "!**/*.test.ts" -l',
      { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    assert.equal(output, "");
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return;
    throw error;
  }
});
