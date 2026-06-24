import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("META-CRED-1D-C adds verify-and-activate route only", () => {
  const routePath = join(
    repoRoot,
    "app/api/channel-connect/meta/verify-and-activate/route.ts"
  );
  const content = readFileSync(routePath, "utf8");
  assert.match(content, /createMetaPageCredentialVerifyAndActivateHandler/i);
  assert.match(content, /isMetaPageCredentialActivationApiEnabled/i);
});

test("activation API is not wired into worker/resolver runtime", () => {
  try {
    const output = execSync(
      'rg "ActivateMetaPageCredentialUseCase|createActivateMetaPageCredentialUseCaseFromBootstrap" src/worker src/application/channelConnect --glob "!**/*.test.ts" -l',
      { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    assert.equal(output, "");
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return;
    throw error;
  }
});

test("META-CRED-1D-C does not add migrations", () => {
  const migrations = readdirSync(join(repoRoot, "supabase/migrations"));
  assert.equal(
    migrations.filter((name) => name.includes("meta_cred_1d_c")).length,
    0
  );
});

test("rotation RPC remains absent from 1D-C scope", () => {
  const route = readFileSync(
    join(repoRoot, "app/api/channel-connect/meta/verify-and-activate/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(route, /rotate_meta_page_credential/i);
});
