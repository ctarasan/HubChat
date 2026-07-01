import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("META-CRED-1D-L-A: worker outbound path does not wire meta_page_credentials resolver yet", () => {
  const workerMain = readFileSync(join(repoRoot, "src/worker/main.ts"), "utf8");
  const workerOutbound = readFileSync(
    join(repoRoot, "src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts"),
    "utf8"
  );
  assert.match(workerMain, /createWorkerFacebookOutboundAdapterResolver/);
  assert.doesNotMatch(workerMain, /MetaPageCredentialRepository|meta_page_credentials|resolveMetaPageRuntimeCredential/i);
  assert.doesNotMatch(workerOutbound, /meta_page_credentials|MetaPageCredentialRepository|resolveMetaPageRuntimeCredential/i);
  assert.equal(
    existsSync(join(repoRoot, "src/application/metaPageCredentialResolver/resolveMetaPageRuntimeCredential.ts")),
    false
  );
});

test("META-CRED-1D-L-A: planned cutover flag parser is not implemented on master", () => {
  const runtimeMode = readFileSync(join(repoRoot, "src/lib/channelConnectRuntimeMode.ts"), "utf8");
  assert.doesNotMatch(runtimeMode, /HUBCHAT_META_PAGE_CREDENTIAL_ENABLED|isMetaPageCredentialResolverEnabled/i);
});

test("META-CRED-1D-L-A: Facebook OAuth-managed outbound still blocks legacy env fallback today", () => {
  const resolver = readFileSync(
    join(repoRoot, "src/application/channelConnect/resolveWorkerOutboundWithChannelConnect.ts"),
    "utf8"
  );
  assert.match(resolver, /err\.blockLegacyFallback/);
  assert.match(resolver, /resolveFacebookWorkerOutboundConfig/);
});
