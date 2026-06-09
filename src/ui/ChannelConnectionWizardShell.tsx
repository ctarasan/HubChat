"use client";

import { useMemo, useState } from "react";
import type { ChannelSettingView, SupportedChannel } from "./channelSettingsModel.js";
import { ChannelConnectionWizardCard } from "./ChannelConnectionWizardCard.js";
import { ChannelConnectionWizardPanel } from "./ChannelConnectionWizardPanel.js";
import {
  resolveWizardCards,
  resolveWizardDataScopeMessage,
  type WizardChannel
} from "./channelConnectionWizardModel.js";

export function ChannelConnectionWizardShell({
  baseUrl,
  channelRows,
  acwApiBody,
  busyChannel,
  testFeedback,
  onSaveCredentials,
  onTestConnection
}: {
  baseUrl: string;
  channelRows: ChannelSettingView[];
  acwApiBody?: unknown;
  busyChannel: SupportedChannel | null;
  testFeedback: Partial<Record<SupportedChannel, string>>;
  onSaveCredentials: (
    channel: SupportedChannel,
    secretInputs: Record<string, string>,
    providerDraft: { pageId: string; accountName: string }
  ) => void;
  onTestConnection: (channel: SupportedChannel) => void;
}) {
  const [selectedChannel, setSelectedChannel] = useState<WizardChannel | null>(null);
  const cards = useMemo(
    () => resolveWizardCards({ baseUrl, channelSettingsRows: channelRows, acwApiBody }),
    [baseUrl, channelRows, acwApiBody]
  );
  const dataScope = useMemo(() => resolveWizardDataScopeMessage(), []);
  const selectedCard = cards.find((card) => card.channel === selectedChannel) ?? null;

  return (
    <section className="channel-wizard-shell" data-testid="channel-connection-wizard">
      <header className="channel-wizard-shell-header">
        <div>
          <p className="team-members-eyebrow">Assisted setup</p>
          <h2>Channel Connection Wizard</h2>
          <p className="hint channel-wizard-shell-subtitle">
            Connect LINE, Facebook, and Instagram independently. Each channel has its own setup guide.
          </p>
        </div>
      </header>

      <div className="card channel-wizard-data-scope" data-testid={dataScope.testId}>
        <h3>{dataScope.title}</h3>
        <p className="hint">{dataScope.body}</p>
        <p className="hint channel-wizard-data-scope-admin">{dataScope.adminHint}</p>
      </div>

      <div className="channel-wizard-grid" data-testid="channel-wizard-grid">
        {cards.map((card) => (
          <ChannelConnectionWizardCard
            key={card.channel}
            card={card}
            selected={selectedChannel === card.channel}
            onSelect={() =>
              setSelectedChannel((current) => (current === card.channel ? null : card.channel))
            }
          />
        ))}
      </div>

      {selectedCard ? (
        <ChannelConnectionWizardPanel
          card={selectedCard}
          busy={busyChannel === selectedCard.channel}
          testMessage={testFeedback[selectedCard.channel] ?? null}
          onClose={() => setSelectedChannel(null)}
          onTestConnection={() => onTestConnection(selectedCard.channel)}
          onSaveCredentials={(secretInputs, providerDraft) =>
            onSaveCredentials(selectedCard.channel, secretInputs, providerDraft)
          }
        />
      ) : null}

      <p className="hint channel-wizard-manual-link">
        Need full manual control? Use the advanced Channel Settings cards below.
      </p>
    </section>
  );
}
