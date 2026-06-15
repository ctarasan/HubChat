"use client";

import {
  humanizePageTasks,
  mapFacebookOAuthErrorCategory,
  type FacebookPageOption
} from "./facebookConnectModel.js";

type FacebookPageSelectorProps = {
  pages: FacebookPageOption[];
  selectedPageId: string | null;
  busy: boolean;
  onSelectPage: (pageId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function FacebookPageSelector({
  pages,
  selectedPageId,
  busy,
  onSelectPage,
  onConfirm,
  onCancel
}: FacebookPageSelectorProps) {
  if (pages.length === 0) {
    return (
      <div className="channel-settings-facebook-connect-page-selector" data-testid="facebook-page-selector">
        <p className="hint">No manageable Pages were returned. Use manual setup below or try again.</p>
        <button type="button" className="inbox-filter-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="channel-settings-facebook-connect-page-selector" data-testid="facebook-page-selector">
      <p className="channel-settings-label">Choose a Facebook Page</p>
      <ul className="channel-settings-facebook-connect-page-list" role="radiogroup" aria-label="Facebook Pages">
        {pages.map((page) => {
          const disabled = busy || !page.selectable;
          const reason =
            page.reasonCode === "MISSING_PAGE_TASKS"
              ? mapFacebookOAuthErrorCategory("MISSING_PAGE_TASKS").message
              : null;
          return (
            <li key={page.pageId} className="channel-settings-facebook-connect-page-item">
              <label className={disabled ? "channel-settings-facebook-connect-page-label disabled" : "channel-settings-facebook-connect-page-label"}>
                <input
                  type="radio"
                  name="facebook-page-option"
                  value={page.pageId}
                  checked={selectedPageId === page.pageId}
                  disabled={disabled}
                  onChange={() => onSelectPage(page.pageId)}
                />
                <span className="channel-settings-facebook-connect-page-name">{page.name}</span>
                <span className="hint channel-settings-facebook-connect-page-id">ID: {page.pageId}</span>
                <span className="hint channel-settings-facebook-connect-page-tasks">
                  Tasks: {humanizePageTasks(page.tasks)}
                </span>
                {page.alreadyConnected ? (
                  <span className="hint channel-settings-facebook-connect-page-note">Already linked</span>
                ) : null}
                {reason ? <span className="hint channel-settings-facebook-connect-page-warning">{reason}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="channel-settings-facebook-connect-actions">
        <button
          type="button"
          className="team-members-add-btn"
          data-testid="facebook-page-confirm"
          disabled={busy || !selectedPageId}
          onClick={onConfirm}
        >
          {busy ? "Confirming…" : "Confirm Page"}
        </button>
        <button type="button" className="inbox-filter-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
