import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cardSource = readFileSync(new URL("./MetaPageCredentialActivationCard.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./metaPageCredentialActivationUiModel.ts", import.meta.url), "utf8");
const enablementSource = readFileSync(
  new URL("./metaPageCredentialActivationUiEnablement.ts", import.meta.url),
  "utf8"
);

const FAKE_TOKEN = "TEST_FAKE_PAGE_TOKEN_MUST_NOT_RENDER";

test("Meta activation card wires boolean tokenPresent state (not token string state)", () => {
  assert.match(cardSource, /const \[tokenPresent, setTokenPresent\] = useState\(false\)/);
  assert.match(cardSource, /deriveTokenPresentFromInputValue\(event\.currentTarget\.value\)/);
  assert.equal(cardSource.includes(`useState("${FAKE_TOKEN}")`), false);
  assert.equal(cardSource.includes("value={token"), false);
  assert.equal(cardSource.includes("setTokenPresent(token"), false);
});

test("clearTokenInput resets boolean tokenPresent", () => {
  assert.match(cardSource, /function clearTokenInput\(\): void \{[\s\S]*setTokenPresent\(false\)/);
});

test("tenant change resets tokenPresent and clears input", () => {
  assert.match(cardSource, /useEffect\(\(\) => \{[\s\S]*setTokenPresent\(false\)[\s\S]*\}, \[tenantId\]\)/);
});

test("review button uses isMetaActivationReviewEnabled with tokenPresent in canProceedToConfirm", () => {
  const fnBlock = cardSource.slice(cardSource.indexOf("function canProceedToConfirm"), cardSource.indexOf("function openConfirmation"));
  assert.equal(fnBlock.includes("isMetaActivationReviewEnabled"), true);
  assert.equal(fnBlock.includes("tokenPresent"), true);
  assert.equal(fnBlock.includes("tokenInputRef.current?.value.trim()"), false);
});

test("activation UI uses password token input with secure attributes", () => {
  assert.match(cardSource, /type="password"/);
  assert.match(cardSource, /autoComplete="new-password"/);
  assert.match(cardSource, /spellCheck=\{false\}/);
  assert.equal(cardSource.includes("localStorage"), false);
  assert.equal(cardSource.includes("sessionStorage"), false);
});

test("token input is uncontrolled via ref rather than persisted React state", () => {
  assert.equal(cardSource.includes("tokenInputRef"), true);
  assert.equal(cardSource.includes(`useState("${FAKE_TOKEN}")`), false);
});

test("confirmation uses shared summary builder without token in summary builder", () => {
  assert.equal(cardSource.includes("buildMetaActivationConfirmationSummary"), true);
  assert.equal(modelSource.includes("buildMetaActivationConfirmationSummary"), true);
  const builderBlock = modelSource.slice(
    modelSource.indexOf("export function buildMetaActivationConfirmationSummary"),
    modelSource.indexOf("export async function metaActivationFetch")
  );
  assert.equal(builderBlock.includes("tokenInputRef"), false);
  assert.equal(builderBlock.includes("accessToken"), false);
});

test("no console logging in activation card", () => {
  assert.equal(cardSource.includes("console.log"), false);
  assert.equal(cardSource.includes("console.debug"), false);
  assert.equal(cardSource.includes("console.info"), false);
});

test("fixed FACEBOOK-only contract preserved in model", () => {
  assert.equal(modelSource.includes("META_ACTIVATION_FIXED_REQUESTED_CHANNELS"), true);
  assert.equal(modelSource.includes("META_ACTIVATION_FIXED_EXPECTED_VERSION"), true);
  assert.equal(modelSource.includes("instagramConnectionId"), false);
});

test("enablement module stores boolean only", () => {
  assert.equal(enablementSource.includes("tokenPresent"), true);
  assert.equal(enablementSource.includes("accessToken"), false);
  assert.equal(enablementSource.includes(FAKE_TOKEN), false);
});
