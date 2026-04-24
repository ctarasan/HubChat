"use client";

import { useEffect, useState } from "react";
import {
  emptySessionConfig,
  loadSessionConfig,
  saveSessionConfig,
  type SessionConfig
} from "../../src/ui/sessionConfig.js";

export default function SetupPage() {
  const [config, setConfig] = useState<SessionConfig>(emptySessionConfig());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadSessionConfig(globalThis.localStorage));
  }, []);

  function onSave() {
    saveSessionConfig(globalThis.localStorage, config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <main className="setup-wrapper">
      <div className="card setup-card">
        <h1>HubChat Setup</h1>
        <p className="hint">Configure session values for dashboard operations.</p>
        <label>
          Base URL
          <input
            value={config.baseUrl}
            onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://your-app.vercel.app"
          />
        </label>
        <label>
          Tenant ID
          <input
            value={config.tenantId}
            onChange={(e) => setConfig((prev) => ({ ...prev, tenantId: e.target.value }))}
            placeholder="tenant uuid"
          />
        </label>
        <label>
          Access Token
          <textarea
            rows={3}
            value={config.accessToken}
            onChange={(e) => setConfig((prev) => ({ ...prev, accessToken: e.target.value }))}
            placeholder="Bearer token value"
          />
        </label>
        <button type="button" onClick={onSave}>Save Session</button>
        {saved ? <div className="hint success-inline">Saved to localStorage</div> : null}
        <a href="/dashboard" className="primary-link">Go to Dashboard</a>
      </div>
    </main>
  );
}
