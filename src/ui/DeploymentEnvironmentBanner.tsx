"use client";

import {
  readDeploymentEnvironmentPresentation,
  type DeploymentEnvironmentPresentation
} from "./deploymentEnvironmentModel.js";

function renderBanner(presentation: DeploymentEnvironmentPresentation) {
  return (
    <div
      className={`deployment-environment-banner deployment-environment-banner-${presentation.kind}`}
      data-testid="deployment-environment-banner"
      role="status"
      aria-live="polite"
      aria-label={`${presentation.label}. ${presentation.warning}`}
    >
      <strong className="deployment-environment-banner-label" data-testid="deployment-environment-banner-label">
        {presentation.label}
      </strong>
      <span className="deployment-environment-banner-warning" data-testid="deployment-environment-banner-warning">
        {presentation.warning}
      </span>
    </div>
  );
}

export function DeploymentEnvironmentBanner() {
  const presentation = readDeploymentEnvironmentPresentation();
  if (!presentation) return null;
  return renderBanner(presentation);
}
