import type { ChannelType } from "../domain/entities.js";
import type { MessageDeliveryFailurePayload } from "../domain/ports.js";
import { InstagramGraphApiError } from "../infrastructure/adapters/channels/instagramGraphApiError.js";

export const INTERNAL_CODE_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW = "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW";
export const INTERNAL_CODE_OUTBOUND_PROVIDER_ERROR = "OUTBOUND_PROVIDER_ERROR";
/** Idempotency lock held (PROCESSING/DONE) but message row has no SENT/FAILED delivery_status yet. */
export const INTERNAL_CODE_OUTBOUND_IDEMPOTENCY_PENDING = "OUTBOUND_IDEMPOTENCY_PENDING";
/** Worker guard: execute() returned without terminal message delivery_status. */
export const INTERNAL_CODE_OUTBOUND_TERMINAL_GUARD = "OUTBOUND_TERMINAL_GUARD";
export const INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR = "FACEBOOK_API_TEMPORARY_ERROR";
export const INTERNAL_CODE_FACEBOOK_TOKEN_EXPIRED = "FACEBOOK_TOKEN_EXPIRED";

/** User-visible Thai copy for Instagram 24h / allowed-window API restriction (Dashboard). */
export const TH_MSG_INSTAGRAM_OUTSIDE_ALLOWED_WINDOW =
  "ส่งไม่ผ่าน: อยู่นอกช่วงเวลาที่ Instagram อนุญาตให้ตอบกลับผ่าน API กรุณาให้ลูกค้าทักกลับเข้ามาใหม่";

export const TH_MSG_OUTBOUND_PROVIDER_GENERIC =
  "ส่งไม่ผ่าน: ผู้ให้บริการปลายทางปฏิเสธการส่งข้อความ กรุณาตรวจสอบรายละเอียดหรือลองใหม่อีกครั้ง";

/** Shown in metadata while queue is retrying (optional; worker may omit if UI does not support RETRYING). */
export const TH_MSG_FACEBOOK_API_TEMPORARY_RETRYING =
  "กำลังลองส่งใหม่: Facebook มีข้อผิดพลาดชั่วคราว กรุณารอสักครู่ ระบบจะลองส่งอีกครั้ง";

/** Final Dashboard copy when retryable Facebook temporary errors exhaust queue max_retries. */
export const TH_MSG_FACEBOOK_API_TEMPORARY_FINAL =
  "ส่งไม่ผ่าน: Facebook มีข้อผิดพลาดจากผู้ให้บริการ กรุณาลองใหม่ภายหลัง";

export const TH_MSG_FACEBOOK_TOKEN_EXPIRED =
  "ส่งไม่ผ่าน: โทเคน Facebook หมดอายุหรือไม่ถูกต้อง กรุณาต่ออายุหรือตั้งค่า Page access token ใหม่";

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

/**
 * Retryable outbound failure: use case does not persist message FAILED; worker uses queue backoff.
 * On dead-letter, worker persists final failure via {@link resolveRetryableDeadLetterFailurePayload}.
 */
export class RetryableOutboundDeliveryError extends Error {
  override readonly name = "RetryableOutboundDeliveryError";

  constructor(
    public readonly deliveryErrorCode: string,
    public readonly userFacingMessage: string,
    public readonly technicalSummary: string,
    causeError?: unknown
  ) {
    super(technicalSummary, { cause: causeError instanceof Error ? causeError : undefined });
  }
}

export function resolveRetryableDeadLetterFailurePayload(err: RetryableOutboundDeliveryError): MessageDeliveryFailurePayload {
  if (err.deliveryErrorCode === INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR) {
    return {
      userFacingMessage: TH_MSG_FACEBOOK_API_TEMPORARY_FINAL,
      deliveryErrorCode: INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR,
      technicalReason: err.technicalSummary
    };
  }
  return {
    userFacingMessage: err.userFacingMessage,
    deliveryErrorCode: err.deliveryErrorCode,
    technicalReason: err.technicalSummary
  };
}

export type OutboundProviderFailureKind =
  | "instagram_outside_allowed_window"
  | "facebook_api_temporary"
  | "facebook_token_expired"
  | "generic_provider";

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

function parseFacebookSendHttpStatus(error: unknown): number | null {
  const raw = error instanceof Error ? error.message : String(error);
  const m = raw.match(/Facebook Send API failed \((\d+)\)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Meta Graph OAuth/session invalid (non-retryable). */
export function isFacebookTokenExpiredError(error: unknown): boolean {
  const { code, message } = parseMetaShape(error);
  if (code === 190) return true;
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid oauth") && m.includes("access token")) return true;
  if (m.includes("error validating access token")) return true;
  if (m.includes("session has been invalidated")) return true;
  return false;
}

/**
 * Temporary Facebook Graph failure: code 1, or HTTP 500 send with unknown-error style body.
 */
export function isFacebookApiTemporaryError(error: unknown): boolean {
  const { code, message } = parseMetaShape(error);
  if (code === 1) return true;
  const http = parseFacebookSendHttpStatus(error);
  const msg = (message ?? "").toLowerCase();
  if (http === 500) {
    if (code === 1) return true;
    if (msg.includes("an unknown error has occurred")) return true;
    if (msg.includes("unknown error")) return true;
  }
  return false;
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

  if (channel === "FACEBOOK") {
    if (isFacebookTokenExpiredError(error)) {
      const { code, message } = parseMetaShape(error);
      return {
        kind: "facebook_token_expired",
        internalCode: INTERNAL_CODE_FACEBOOK_TOKEN_EXPIRED,
        userFacingMessage: TH_MSG_FACEBOOK_TOKEN_EXPIRED,
        retryable: false,
        technicalSummary: `Facebook token/session invalid (${code ?? "?"}): ${message ?? "n/a"}`
      };
    }
    if (isFacebookApiTemporaryError(error)) {
      const { code, message } = parseMetaShape(error);
      const http = parseFacebookSendHttpStatus(error);
      return {
        kind: "facebook_api_temporary",
        internalCode: INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR,
        userFacingMessage: TH_MSG_FACEBOOK_API_TEMPORARY_RETRYING,
        retryable: true,
        technicalSummary: `Facebook temporary API error http=${http ?? "n/a"} metaCode=${code ?? "n/a"}: ${message ?? "n/a"}`
      };
    }
    let technicalSummary = error instanceof Error ? error.message : String(error);
    if (error instanceof InstagramGraphApiError) {
      const m = error.meta;
      technicalSummary = [
        m.message ?? "Facebook send failed",
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
