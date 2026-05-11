import type { ChannelType } from "../domain/entities.js";
import { InstagramGraphApiError } from "../infrastructure/adapters/channels/instagramGraphApiError.js";

export const INTERNAL_CODE_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW = "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW";
export const INTERNAL_CODE_OUTBOUND_PROVIDER_ERROR = "OUTBOUND_PROVIDER_ERROR";

/** User-visible Thai copy for Instagram 24h / allowed-window API restriction (Dashboard). */
export const TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW =
  "ส่งไม่ผ่าน: อยู่นอกช่วงเวลาที่ Instagram อนุญาตให้ตอบกลับผ่าน API กรุณาให้ลูกค้าทักกลับเข้ามาใหม่";

export const TH_MSG_OUTBOUND_PROVIDER_GENERIC =
  "ส่งไม่ผ่าน: ผู้ให้บริการปลายทางปฏิเสธการส่งข้อความ กรุณาตรวจสอบรายละเอียดหรือลองใหม่อีกครั้ง";

export class TerminalOutboundDeliveryError extends Error {
  override readonly name = "TerminalOutboundDeliveryError";

  constructor(
    message: string,
    public readonly internalCode: string,
    public readonly causeError?: unknown
  ) {
    super(message);
  }
}

export type OutboundProviderFailureKind = "instagram_outside_allowed_window" | "generic_provider";

export interface OutboundProviderFailureClassification {
  kind: OutboundProviderFailureKind;
  internalCode: string;
  userFacingMessage: string;
  /** When false, queue worker should markDone and not retry. */
  retryable: boolean;
  /** Safe one-line for logs / metadata.reason (no tokens). */
  technicalSummary: string;
}

function parseMetaShape(error: unknown): {
  code: number | null;
  subcode: number | null;
  message: string | null;
} {
  if (error instanceof InstagramGraphApiError) {
    const m = error.meta;
    return {
      code: typeof m.code === "number" ? m.code : null,
      subcode: typeof m.error_subcode === "number" ? m.error_subcode : null,
      message: typeof m.message === "string" ? m.message : null
    };
  }
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) {
    return { code: null, subcode: null, message: raw };
  }
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    const e = parsed.error;
    return {
      code: typeof e?.code === "number" ? e.code : null,
      subcode: typeof e?.error_subcode === "number" ? e.error_subcode : null,
      message: typeof e?.message === "string" ? e.message : raw
    };
  } catch {
    return { code: null, subcode: null, message: raw };
  }
}

/** Instagram DM: Meta code 10 + subcode 2534022, or legacy phrasing / subcodes. */
export function isInstagramOutsideAllowedWindowError(error: unknown): boolean {
  const { code, subcode, message } = parseMetaShape(error);
  if (code !== 10) return false;
  if (subcode === 2534022 || subcode === 2018278) return true;
  const m = (message ?? "").toLowerCase();
  if (!m.includes("outside")) return false;
  if (!m.includes("window")) return false;
  return m.includes("allowed");
}

export function classifyOutboundProviderFailure(
  channel: ChannelType,
  error: unknown
): OutboundProviderFailureClassification {
  if (channel === "INSTAGRAM" && isInstagramOutsideAllowedWindowError(error)) {
    const { code, subcode, message } = parseMetaShape(error);
    return {
      kind: "instagram_outside_allowed_window",
      internalCode: INTERNAL_CODE_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW,
      userFacingMessage: TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW,
      retryable: false,
      technicalSummary: `Instagram outside allowed window (${code ?? "?"}/${subcode ?? "?"}): ${message ?? "n/a"}`
    };
  }

  let technicalSummary = error instanceof Error ? error.message : String(error);
  if (error instanceof InstagramGraphApiError) {
    const m = error.meta;
    technicalSummary = [
      m.message ?? "Instagram send failed",
      `http=${error.httpStatus}`,
      `code=${m.code ?? "n/a"}`,
      `subcode=${m.error_subcode ?? "n/a"}`,
      `type=${m.type ?? "n/a"}`,
      `fbtrace_id=${m.fbtrace_id ?? "n/a"}`
    ].join(" | ");
  }

  return {
    kind: "generic_provider",
    internalCode: INTERNAL_CODE_OUTBOUND_PROVIDER_ERROR,
    userFacingMessage: TH_MSG_OUTBOUND_PROVIDER_GENERIC,
    retryable: true,
    technicalSummary
  };
}
