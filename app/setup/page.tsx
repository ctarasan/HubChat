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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [tokenSuccess, setTokenSuccess] = useState("");

  useEffect(() => {
    setConfig(loadSessionConfig(globalThis.localStorage));
  }, []);

  function onSave() {
    saveSessionConfig(globalThis.localStorage, config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function onFetchSupabaseToken() {
    setTokenLoading(true);
    setTokenError("");
    setTokenSuccess("");
    try {
      const response = await fetch("/api/setup/supabase-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = (await response.json().catch(() => ({}))) as { accessToken?: string; error?: string };
      if (!response.ok) {
        setTokenError(data.error ?? "Failed to request token");
        return;
      }
      const nextToken = typeof data.accessToken === "string" ? data.accessToken.trim() : "";
      if (!nextToken) {
        setTokenError("No access token returned");
        return;
      }
      setConfig((prev) => ({ ...prev, accessToken: nextToken }));
      setPassword("");
      setTokenSuccess("Fetched token and filled Access Token field.");
    } catch {
      setTokenError("Failed to request token");
    } finally {
      setTokenLoading(false);
    }
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
        <div className="card">
          <h3>Get Supabase Access Token</h3>
          <p className="hint">Use Supabase Auth username/email and password to request token directly.</p>
          <label>
            Username (Email)
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="sales@yourcompany.com"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Supabase Auth password"
              autoComplete="current-password"
            />
          </label>
          <button type="button" onClick={onFetchSupabaseToken} disabled={tokenLoading}>
            {tokenLoading ? "Requesting token..." : "Get Token"}
          </button>
          {tokenError ? <div className="hint error-inline">{tokenError}</div> : null}
          {tokenSuccess ? <div className="hint success-inline">{tokenSuccess}</div> : null}
        </div>
        <button type="button" onClick={onSave}>Save Session</button>
        {saved ? <div className="hint success-inline">Saved to localStorage</div> : null}
        <a href="/dashboard" className="primary-link">Go to Dashboard</a>
      </div>
    </main>
  );
}
