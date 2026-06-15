"use client";

type FacebookReconnectBannerProps = {
  message?: string | null;
  busy: boolean;
  onReconnect: () => void;
};

export function FacebookReconnectBanner({ message, busy, onReconnect }: FacebookReconnectBannerProps) {
  return (
    <div className="channel-settings-facebook-connect-reconnect-banner" data-testid="facebook-reconnect-banner" role="status">
      <p>{message?.trim() || "Authorization expired or revoked. Reconnect to restore assisted connection."}</p>
      <button
        type="button"
        className="team-members-add-btn"
        data-testid="facebook-reconnect-start"
        disabled={busy}
        onClick={onReconnect}
      >
        {busy ? "Reconnecting…" : "Reconnect Facebook"}
      </button>
    </div>
  );
}
