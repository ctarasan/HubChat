/**
 * Outbound reliability smoke (controlled mutation, opt-in only).
 *
 * This spec is intentionally skipped by default and only runs when:
 * - HUBCHAT_ENABLE_OUTBOUND_MUTATION_SMOKE=true
 * - Explicit safe fixture env vars are provided
 *
 * It must never use hardcoded customer identifiers.
 */
import { expect, test, type Page } from "@playwright/test";

const ENABLE_FLAG = "HUBCHAT_ENABLE_OUTBOUND_MUTATION_SMOKE";

const REQUIRED_BASE = [
  "E2E_BASE_URL",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD"
] as const;

type OutboundPayload = {
  tenantId: string;
  leadId: string;
  conversationId: string;
  conversationIds?: string[];
  channel: "LINE" | "FACEBOOK" | "INSTAGRAM";
  channelThreadId: string;
  type: "text" | "image" | "document_pdf";
  content: string;
  mediaUrl?: string;
  previewUrl?: string;
  mediaMimeType?: string;
  fileName?: string;
  fileSizeBytes?: number;
};

function isEnabled(): boolean {
  return process.env[ENABLE_FLAG]?.trim() === "true";
}

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((name) => !process.env[name]?.trim());
}

function readFixture(prefix: string): OutboundPayload | null {
  const tenantId = process.env[`${prefix}_TENANT_ID`]?.trim();
  const leadId = process.env[`${prefix}_LEAD_ID`]?.trim();
  const conversationId = process.env[`${prefix}_CONVERSATION_ID`]?.trim();
  const channelThreadId = process.env[`${prefix}_CHANNEL_THREAD_ID`]?.trim();
  if (!tenantId || !leadId || !conversationId || !channelThreadId) return null;

  const channel = process.env[`${prefix}_CHANNEL`]?.trim() as OutboundPayload["channel"] | undefined;
  const type = (process.env[`${prefix}_TYPE`]?.trim() as OutboundPayload["type"] | undefined) ?? "text";
  const content = process.env[`${prefix}_CONTENT`]?.trim() ?? "PROD-D2 outbound reliability smoke";
  if (!channel || !["LINE", "FACEBOOK", "INSTAGRAM"].includes(channel)) return null;

  const conversationIdsRaw = process.env[`${prefix}_CONVERSATION_IDS`]?.trim();
  const conversationIds = conversationIdsRaw
    ? conversationIdsRaw.split(",").map((v) => v.trim()).filter(Boolean)
    : undefined;

  const fileSizeRaw = process.env[`${prefix}_FILE_SIZE_BYTES`]?.trim();
  const fileSizeBytes = fileSizeRaw ? Number(fileSizeRaw) : undefined;

  return {
    tenantId,
    leadId,
    conversationId,
    conversationIds,
    channel,
    channelThreadId,
    type,
    content,
    mediaUrl: process.env[`${prefix}_MEDIA_URL`]?.trim() || undefined,
    previewUrl: process.env[`${prefix}_PREVIEW_URL`]?.trim() || undefined,
    mediaMimeType: process.env[`${prefix}_MEDIA_MIME_TYPE`]?.trim() || undefined,
    fileName: process.env[`${prefix}_FILE_NAME`]?.trim() || undefined,
    fileSizeBytes: Number.isFinite(fileSizeBytes) ? fileSizeBytes : undefined
  };
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(process.env.E2E_ADMIN_EMAIL!.trim());
  await page.getByTestId("login-password").fill(process.env.E2E_ADMIN_PASSWORD!.trim());
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

async function postSend(
  page: Page,
  payload: OutboundPayload
): Promise<{ status: number; body: string }> {
  return page.evaluate(async (p) => {
    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p)
    });
    return { status: response.status, body: await response.text() };
  }, payload);
}

test.describe("Outbound reliability smoke (opt-in controlled mutation)", () => {
  const missing = missingBaseEnv();
  test.skip(!isEnabled(), `Set ${ENABLE_FLAG}=true to run controlled outbound mutation smoke`);
  test.skip(missing.length > 0, `Missing required env: ${missing.join(", ")}`);

  test("configured safe fixtures return expected send API responses", async ({ page }) => {
    await loginAsAdmin(page);

    const successFixtures = [
      readFixture("HUBCHAT_SMOKE_LINE_TEXT"),
      readFixture("HUBCHAT_SMOKE_FACEBOOK_DM_TEXT"),
      readFixture("HUBCHAT_SMOKE_FACEBOOK_COMMENT_FLOW"),
      readFixture("HUBCHAT_SMOKE_INSTAGRAM_TEXT"),
      readFixture("HUBCHAT_SMOKE_INSTAGRAM_IMAGE")
    ].filter((v): v is OutboundPayload => Boolean(v));

    const igPdfNegative = readFixture("HUBCHAT_SMOKE_INSTAGRAM_PDF_NEGATIVE");

    expect(
      successFixtures.length + (igPdfNegative ? 1 : 0),
      "Provide at least one safe outbound fixture env set before enabling this test"
    ).toBeGreaterThan(0);

    for (const payload of successFixtures) {
      const response = await postSend(page, payload);
      expect(response.status, `${payload.channel} send should be queued (202)`).toBe(202);
      expect(response.body.includes("access_token")).toBe(false);
      expect(response.body.toLowerCase().includes("bearer ")).toBe(false);
    }

    if (igPdfNegative) {
      const response = await postSend(page, igPdfNegative);
      expect(response.status, "Instagram PDF negative validation should fail before provider call").toBe(400);
      expect(response.body.includes("access_token")).toBe(false);
      expect(response.body.toLowerCase().includes("bearer ")).toBe(false);
    }
  });
});
