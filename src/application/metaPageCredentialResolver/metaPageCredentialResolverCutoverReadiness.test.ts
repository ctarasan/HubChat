import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("META-CRED-1D-L-C: runtime resolver module exists", () => {
  assert.equal(
    existsSync(join(repoRoot, "src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.ts")),
    true
  );
});

test("META-CRED-1D-L-C: feature flag parser exists and defaults OFF", () => {
  const flags = readFileSync(join(repoRoot, "src/lib/metaPageCredentialRuntimeFlags.ts"), "utf8");
  assert.match(flags, /HUBCHAT_META_PAGE_CREDENTIAL_ENABLED/);
  assert.match(flags, /isMetaPageCredentialEnabled/);
});

test("META-CRED-1D-L-C: worker composes Meta Page credential repository when flag enabled", () => {
  const workerMain = readFileSync(join(repoRoot, "src/worker/main.ts"), "utf8");
  const composition = readFileSync(join(repoRoot, "src/worker/workerMetaPageCredentialComposition.ts"), "utf8");
  assert.match(workerMain, /isMetaPageCredentialEnabled/);
  assert.match(workerMain, /createWorkerMetaPageCredentialRepository/);
  assert.match(workerMain, /metaPageCredentialRepository/);
  assert.match(composition, /SupabaseMetaPageCredentialRepository/);
});

test("META-CRED-1D-L-C: Facebook outbound invokes Meta Page resolver under flag wiring", () => {
  const workerOutbound = readFileSync(
    join(repoRoot, "src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts"),
    "utf8"
  );
  assert.match(workerOutbound, /tryResolveFacebookFromMetaPageCredential/);
  assert.match(workerOutbound, /isMetaPageCredentialEnabled/);
  assert.match(workerOutbound, /meta_page_credential/);
  assert.doesNotMatch(workerOutbound, /INSTAGRAM.*metaPageCredential/i);
});

test("META-CRED-1D-L-C: Facebook OAuth-managed outbound still blocks legacy env fallback", () => {
  const resolver = readFileSync(
    join(repoRoot, "src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts"),
    "utf8"
  );
  assert.match(resolver, /err\.blockLegacyFallback/);
});
