/** Pure helpers for logout confirmation dialog (no secrets). */

export type LogoutConfirmPhase = "closed" | "open" | "pending" | "error";

export function canDismissLogoutConfirm(phase: LogoutConfirmPhase): boolean {
  return phase === "open" || phase === "error";
}

export function canSubmitLogoutConfirm(phase: LogoutConfirmPhase): boolean {
  return phase === "open" || phase === "error";
}

/** Ensures confirm action runs at most once while a logout is in flight. */
export function createLogoutSubmitGuard() {
  let inFlight = false;
  return {
    tryBegin(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end(): void {
      inFlight = false;
    },
    get inFlight() {
      return inFlight;
    }
  };
}

export const LOGOUT_CONFIRM_COPY = {
  title: "ออกจากระบบ",
  message: "คุณต้องการออกจากระบบจริงหรือไม่?",
  cancel: "ยกเลิก",
  confirm: "ออกจากระบบ",
  pending: "กำลังออกจากระบบ...",
  errorFallback: "Unable to sign out. Please try again."
} as const;
