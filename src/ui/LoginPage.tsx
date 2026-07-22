"use client";

import { useEffect, useMemo, useState } from "react";
import { saveSessionConfig } from "./sessionConfig.js";
import { SMARTKORP_BRAND_ALT, SMARTKORP_BRAND_ASSETS } from "./brandAssets.js";
import {
  readLoginReason,
  readSafeReturnTo,
  resetSessionExpiredRedirectGuard,
  sessionExpiredMessageForReason
} from "./sessionExpiredRedirect.js";

const MULTI_WORKSPACE = "This account is linked to more than one workspace. Please contact your administrator.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const search = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.search;
  }, []);

  useEffect(() => {
    resetSessionExpiredRedirectGuard();
    setSessionNotice(sessionExpiredMessageForReason(readLoginReason(search)));
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const em = email.trim();
    if (!em) {
      setError("Enter your email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password })
      });
      const json = (await res.json().catch(() => ({}))) as {
        accessToken?: string;
        tenantId?: string;
        baseUrl?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setError("Invalid email or password.");
          return;
        }
        if (res.status === 403) {
          setError(
            json.error?.trim()
              ? json.error
              : "Your account is not active in this workspace. Please contact your administrator."
          );
          return;
        }
        if (res.status === 409 && json.code === "MULTIPLE_TENANTS") {
          setError(MULTI_WORKSPACE);
          return;
        }
        setError(json.error?.trim() ? json.error : "Sign-in failed. Please try again.");
        return;
      }
      const accessToken = typeof json.accessToken === "string" ? json.accessToken.trim() : "";
      const tenantId = typeof json.tenantId === "string" ? json.tenantId.trim() : "";
      const baseUrl = typeof json.baseUrl === "string" && json.baseUrl.trim() ? json.baseUrl.trim() : "";
      if (!accessToken || !tenantId || !baseUrl) {
        setError("Sign-in failed. Please try again.");
        return;
      }
      saveSessionConfig(globalThis.localStorage, { baseUrl, tenantId, accessToken });
      resetSessionExpiredRedirectGuard();
      const returnTo = readSafeReturnTo(typeof window !== "undefined" ? window.location.search : search);
      window.location.replace(returnTo ?? "/dashboard");
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hub-login-root setup-wrapper">
      <div className="card hub-login-card">
        <div className="hub-login-brand">
          <img
            className="hub-login-brand-logo"
            src={SMARTKORP_BRAND_ASSETS.loginWordmark}
            alt={SMARTKORP_BRAND_ALT}
            width={192}
            height={42}
            decoding="async"
            data-testid="login-brand-logo"
          />
        </div>
        <h1 className="hub-login-title">Sign in to HubChat</h1>
        <p className="hint hub-login-subtitle">Sign in to manage conversations, leads, and your sales team.</p>
        {sessionNotice ? (
          <div className="hub-login-session-notice" role="status" data-testid="login-session-expired-notice">
            {sessionNotice}
          </div>
        ) : null}
        <form className="hub-login-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="hub-login-field">
            <span className="hub-login-label">Email</span>
            <input
              type="email"
              data-testid="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          </label>
          <label className="hub-login-field">
            <span className="hub-login-label">Password</span>
            <input
              type="password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          {error ? (
            <div className="hub-login-error" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="hub-login-submit" data-testid="login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="hub-login-advanced">
          <a href="/setup" className="secondary-link hub-login-advanced-link">
            Advanced setup
          </a>
        </p>
      </div>
    </main>
  );
}
