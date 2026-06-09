"use client";

import { useState } from "react";
import {
  CHANNEL_SECRET_FIELDS,
  channelPathParam,
  channelSupportsProviderMetadata,
  metaProviderFieldLabels
} from "./channelSettingsModel.js";
import type { WizardChannelCard } from "./channelConnectionWizardModel.js";
import { wizardChannelTitle } from "./channelConnectionWizardModel.js";

export function ChannelConnectionWizardPanel({
  card,
  busy,
  testMessage,
  onTestConnection,
  onSaveCredentials,
  onClose
}: {
  card: WizardChannelCard;
  busy: boolean;
  testMessage: string | null;
  onTestConnection: () => void;
  onSaveCredentials: (secretInputs: Record<string, string>, providerDraft: { pageId: string; accountName: string }) => void;
  onClose: () => void;
}) {
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [pageId, setPageId] = useState("");
  const [accountName, setAccountName] = useState("");
  const providerLabels = metaProviderFieldLabels(card.channel);
  const showProviderFields = channelSupportsProviderMetadata(card.channel) && providerLabels;

  function updateSecret(patchKey: string, value: string) {
    setSecretInputs((prev) => ({ ...prev, [patchKey]: value }));
  }

  return (
    <section
      className="card channel-wizard-panel"
      data-testid={`channel-wizard-panel-${channelPathParam(card.channel)}`}
      aria-label={`${wizardChannelTitle(card.channel)} setup guide`}
    >
      <header className="channel-wizard-panel-head">
        <div>
          <h3>{wizardChannelTitle(card.channel)} setup guide</h3>
          <p className="hint">Credentials are write-only and never shown after save.</p>
        </div>
        <button
          type="button"
          className="inbox-filter-btn"
          data-testid="channel-wizard-panel-close"
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <ol className="channel-wizard-stepper" data-testid="channel-wizard-stepper">
        {card.steps.map((step, index) => (
          <li
            key={step.id}
            className={`channel-wizard-step${step.completed ? " channel-wizard-step-complete" : ""}`}
            data-testid={`channel-wizard-step-${card.channel.toLowerCase()}-${step.id}`}
          >
            <span className="channel-wizard-step-index">{index + 1}</span>
            <div className="channel-wizard-step-body">
              <strong>{step.title}</strong>
              <p className="hint">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      {card.webhookUrl ? (
        <div className="channel-wizard-webhook" data-testid="channel-wizard-webhook-copy">
          <label className="channel-wizard-field">
            <span className="channel-wizard-field-label">Callback / webhook URL</span>
            <div className="channel-wizard-copy-row">
              <input type="text" readOnly value={card.webhookUrl} className="channel-wizard-copy-input" />
              <button
                type="button"
                className="inbox-filter-btn"
                data-testid="channel-wizard-webhook-copy-btn"
                onClick={() => void navigator.clipboard?.writeText(card.webhookUrl ?? "")}
              >
                Copy
              </button>
            </div>
          </label>
        </div>
      ) : null}

      {showProviderFields && providerLabels ? (
        <div className="channel-wizard-provider-fields" data-testid="channel-wizard-provider-fields">
          <label className="channel-wizard-field">
            <span className="channel-wizard-field-label">{providerLabels.accountNameLabel}</span>
            <input
              type="text"
              autoComplete="off"
              placeholder="Safe display label (not sent as a secret)"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              data-testid="channel-wizard-account-name"
            />
          </label>
          <p className="hint">{providerLabels.accountNameHint}</p>
          <label className="channel-wizard-field">
            <span className="channel-wizard-field-label">{providerLabels.pageIdLabel}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Required for connection tests (stored as metadata)"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              data-testid="channel-wizard-page-id"
            />
          </label>
          <p className="hint">{providerLabels.pageIdHint}</p>
        </div>
      ) : null}

      <div className="channel-wizard-credentials" data-testid="channel-wizard-credentials">
        <p className="channel-wizard-field-label">Write-only credentials</p>
        {CHANNEL_SECRET_FIELDS[card.channel].map((field) => (
          <label key={field.patchKey} className="channel-wizard-field">
            <span className="channel-wizard-field-label">{field.label}</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Enter new value (never displayed after save)"
              value={secretInputs[field.patchKey] ?? ""}
              onChange={(e) => updateSecret(field.patchKey, e.target.value)}
              data-testid={`channel-wizard-secret-${field.patchKey.replace(/_/g, "-")}`}
            />
          </label>
        ))}
      </div>

      <div className="channel-wizard-panel-actions">
        {card.supportsWizardSave ? (
          <button
            type="button"
            className="inbox-filter-btn inbox-filter-btn-active"
            data-testid="channel-wizard-save"
            disabled={busy}
            onClick={() => onSaveCredentials(secretInputs, { pageId, accountName })}
          >
            {busy ? "Saving…" : "Save credentials"}
          </button>
        ) : null}
        {card.supportsTestConnection ? (
          <button
            type="button"
            className="inbox-filter-btn"
            data-testid="channel-wizard-test"
            disabled={busy}
            onClick={onTestConnection}
          >
            {busy ? "Testing…" : "Test connection"}
          </button>
        ) : null}
      </div>

      {testMessage ? (
        <p className="hint channel-wizard-test-feedback" data-testid="channel-wizard-test-feedback" role="status">
          {testMessage}
        </p>
      ) : null}
    </section>
  );
}
