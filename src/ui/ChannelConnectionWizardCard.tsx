"use client";

import type { WizardChannelCard } from "./channelConnectionWizardModel.js";
import { wizardChannelTitle } from "./channelConnectionWizardModel.js";

export function ChannelConnectionWizardCard({
  card,
  selected,
  onSelect
}: {
  card: WizardChannelCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`card channel-wizard-card${selected ? " channel-wizard-card-selected" : ""}`}
      data-testid={card.testId}
    >
      <header className="channel-wizard-card-head">
        <h3>{wizardChannelTitle(card.channel)}</h3>
        <span className={card.statusClassName} data-testid={`${card.testId}-status`}>
          {card.statusLabel}
        </span>
      </header>

      {card.connectionLabel ? (
        <p className="channel-wizard-connection-label" data-testid={`${card.testId}-label`}>
          {card.connectionLabel}
        </p>
      ) : null}

      {card.missingSteps.length > 0 ? (
        <div className="channel-wizard-missing-steps" data-testid={`${card.testId}-missing`}>
          <p className="channel-wizard-missing-title">Missing setup</p>
          <ul>
            {card.missingSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint channel-wizard-missing-none" data-testid={`${card.testId}-missing-none`}>
          Required setup complete
        </p>
      )}

      <p className="hint channel-wizard-last-status" data-testid={`${card.testId}-last-status`}>
        {card.lastStatusText}
      </p>

      <button
        type="button"
        className="channel-wizard-open-btn inbox-filter-btn"
        data-testid={`${card.testId}-open`}
        onClick={onSelect}
        aria-expanded={selected}
      >
        {selected ? "Close guide" : "Open setup guide"}
      </button>
    </article>
  );
}
