"use client";

import {
  buildFacebookCapabilityHealthSections,
  deriveFacebookCapabilityOverallState,
  facebookCapabilityItemStatusCssClass,
  facebookCapabilityItemStatusLabel,
  facebookCapabilityOverallCssClass,
  facebookCapabilityOverallLabel,
  shouldShowFacebookCapabilityReauthorize,
  shouldShowFacebookCapabilityRunHealth,
  type BuildFacebookCapabilityHealthInput
} from "./facebookCapabilityHealthModel.js";
import type { FacebookConnectDisplayState, FacebookConnectStatus } from "./facebookConnectModel.js";

export type FacebookCapabilityHealthPanelProps = {
  status: FacebookConnectStatus;
  presentationState: FacebookConnectDisplayState;
  healthChecks: BuildFacebookCapabilityHealthInput["healthChecks"];
  healthResult: BuildFacebookCapabilityHealthInput["healthResult"];
  healthChecking: boolean;
  healthActionEnabled: boolean;
  statusLoaded: boolean;
  disabled: boolean;
  healthError: string | null;
  onRunHealthCheck: () => void;
  onReauthorize: () => void;
  reauthorizeBusy: boolean;
};

export function FacebookCapabilityHealthPanel({
  status,
  presentationState,
  healthChecks,
  healthResult,
  healthChecking,
  healthActionEnabled,
  statusLoaded,
  disabled,
  healthError,
  onRunHealthCheck,
  onReauthorize,
  reauthorizeBusy
}: FacebookCapabilityHealthPanelProps) {
  const modelInput: BuildFacebookCapabilityHealthInput = {
    status,
    presentationState,
    healthChecks,
    healthResult,
    healthChecking
  };

  const overallState = deriveFacebookCapabilityOverallState(modelInput);
  const sections = buildFacebookCapabilityHealthSections(modelInput);
  const showRunHealth = shouldShowFacebookCapabilityRunHealth({
    healthActionEnabled,
    oauthAvailable: status.oauthAvailable,
    disabled,
    statusLoaded,
    hasConnection: Boolean(status.connectionId || status.providerPageId)
  });
  const showReauthorize = shouldShowFacebookCapabilityReauthorize({
    oauthAvailable: status.oauthAvailable,
    healthActionEnabled,
    presentationState,
    reconnectRequired: status.reconnectRequired
  });

  return (
    <section
      className="channel-settings-facebook-capability"
      data-testid="facebook-capability-health"
      aria-label="Facebook capability health"
    >
      <div className="channel-settings-facebook-capability-head">
        <p className="channel-settings-label">Facebook Capability Health</p>
        <span
          className={`channel-settings-status-badge ${facebookCapabilityOverallCssClass(overallState)}`}
          data-testid="facebook-capability-overall-state"
        >
          {facebookCapabilityOverallLabel(overallState)}
        </span>
      </div>

      {healthError ? (
        <p
          className="hint channel-settings-facebook-capability-error"
          data-testid="facebook-capability-health-error"
          role="alert"
        >
          {healthError}
        </p>
      ) : null}

      <div className="channel-settings-facebook-capability-sections">
        {sections.map((section) => (
          <div
            key={section.id}
            className="channel-settings-facebook-capability-section"
            data-testid={`facebook-capability-section-${section.id}`}
          >
            <div className="channel-settings-facebook-capability-section-head">
              <h4 className="channel-settings-facebook-capability-section-title">{section.title}</h4>
              <span
                className={`channel-settings-facebook-capability-section-status ${facebookCapabilityItemStatusCssClass(section.status)}`}
                data-testid={`facebook-capability-section-status-${section.id}`}
              >
                {facebookCapabilityItemStatusLabel(section.status)}
              </span>
            </div>
            <ul className="channel-settings-facebook-capability-items">
              {section.items.map((item) => (
                <li
                  key={item.key}
                  className={`channel-settings-facebook-capability-item ${facebookCapabilityItemStatusCssClass(item.status)}`}
                  data-testid={`facebook-capability-item-${section.id}-${item.key}`}
                >
                  <span className="channel-settings-facebook-capability-item-label">{item.label}</span>
                  <span className="channel-settings-facebook-capability-item-status">
                    {facebookCapabilityItemStatusLabel(item.status)}
                  </span>
                  {item.hint ? (
                    <span className="hint channel-settings-facebook-capability-item-hint">{item.hint}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="channel-settings-facebook-capability-actions">
        {showRunHealth ? (
          <button
            type="button"
            className="team-members-add-btn"
            data-testid="facebook-run-health-check"
            disabled={disabled || healthChecking}
            aria-busy={healthChecking}
            onClick={onRunHealthCheck}
          >
            {healthChecking ? "Running health check…" : "Run Health Check"}
          </button>
        ) : null}
        {showReauthorize ? (
          <button
            type="button"
            className="inbox-filter-btn"
            data-testid="facebook-capability-reauthorize"
            disabled={disabled || reauthorizeBusy}
            onClick={onReauthorize}
          >
            {reauthorizeBusy ? "Re-authorizing…" : "Re-authorize Facebook"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
