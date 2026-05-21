import type { ChannelRuntimeConfig, SupportedChannelSettingChannel } from "../../../domain/channelSettings.js";
import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";

export type ChannelHealthCheckMetadata = {
  providerPageId?: string;
  providerAccountName?: string;
};

export type ChannelHealthCheckOutcome = {
  ok: boolean;
  message: string;
  metadata?: ChannelHealthCheckMetadata;
};

export type FetchFn = typeof fetch;

const DEFAULT_GRAPH_VERSION = "v25.0";

function normalizeGraphVersion(value?: string): string {
  const raw = (value ?? DEFAULT_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return raw.startsWith("v") ? raw : `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

async function readGraphErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; type?: string; code?: number };
    };
    const parts = [
      body.error?.message,
      body.error?.type ? `type=${body.error.type}` : null,
      body.error?.code !== undefined ? `code=${body.error.code}` : null,
      `http=${response.status}`
    ].filter(Boolean);
    return parts.join(" ") || `Graph API request failed (HTTP ${response.status})`;
  } catch {
    return `Graph API request failed (HTTP ${response.status})`;
  }
}

export async function verifyLineChannelHealth(
  runtime: ChannelRuntimeConfig,
  fetchFn: FetchFn = fetch
): Promise<ChannelHealthCheckOutcome> {
  const token = runtime.secrets.accessToken?.trim();
  if (!token) {
    return { ok: false, message: "LINE channel access token is missing." };
  }

  try {
    const response = await fetchFn("https://api.line.me/v2/bot/info", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const detail = sanitizeProviderErrorMessage(
        `LINE bot info request failed (HTTP ${response.status})`
      );
      return { ok: false, message: detail };
    }

    const body = (await response.json()) as {
      userId?: string;
      basicId?: string;
      displayName?: string;
    };
    const accountName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : typeof body.basicId === "string" && body.basicId.trim()
          ? body.basicId.trim()
          : undefined;
    const pageId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : undefined;

    return {
      ok: true,
      message: "LINE connection verified.",
      metadata: {
        ...(pageId ? { providerPageId: pageId } : {}),
        ...(accountName ? { providerAccountName: accountName } : {})
      }
    };
  } catch (error) {
    return { ok: false, message: sanitizeProviderErrorMessage(error) };
  }
}

export async function verifyFacebookChannelHealth(
  runtime: ChannelRuntimeConfig,
  fetchFn: FetchFn = fetch,
  graphVersion = DEFAULT_GRAPH_VERSION
): Promise<ChannelHealthCheckOutcome> {
  const token = runtime.secrets.accessToken?.trim();
  if (!token) {
    return { ok: false, message: "Facebook page access token is missing." };
  }

  const version = normalizeGraphVersion(graphVersion);
  const pageId = runtime.providerPageId?.trim();
  const target = pageId ? encodeURIComponent(pageId) : "me";
  const url = `https://graph.facebook.com/${version}/${target}?fields=id,name&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetchFn(url, { method: "GET" });
    if (!response.ok) {
      return { ok: false, message: sanitizeProviderErrorMessage(await readGraphErrorMessage(response)) };
    }

    const body = (await response.json()) as { id?: string; name?: string };
    const providerPageId = typeof body.id === "string" ? body.id : pageId;
    const providerAccountName = typeof body.name === "string" ? body.name.trim() : undefined;

    return {
      ok: true,
      message: "Facebook connection verified.",
      metadata: {
        ...(providerPageId ? { providerPageId } : {}),
        ...(providerAccountName ? { providerAccountName } : {})
      }
    };
  } catch (error) {
    return { ok: false, message: sanitizeProviderErrorMessage(error) };
  }
}

export async function verifyInstagramChannelHealth(
  runtime: ChannelRuntimeConfig,
  fetchFn: FetchFn = fetch,
  graphVersion = DEFAULT_GRAPH_VERSION
): Promise<ChannelHealthCheckOutcome> {
  const token = runtime.secrets.accessToken?.trim();
  if (!token) {
    return { ok: false, message: "Instagram page access token is missing." };
  }

  const pageId = runtime.providerPageId?.trim();
  if (!pageId) {
    return { ok: false, message: "Instagram Facebook Page id is required for verification." };
  }

  const version = normalizeGraphVersion(graphVersion);
  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}` +
    `?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetchFn(url, { method: "GET" });
    if (!response.ok) {
      return { ok: false, message: sanitizeProviderErrorMessage(await readGraphErrorMessage(response)) };
    }

    const body = (await response.json()) as {
      id?: string;
      name?: string;
      instagram_business_account?: { id?: string; username?: string; name?: string };
    };
    const ig = body.instagram_business_account;
    if (!ig?.id) {
      return {
        ok: false,
        message: "Instagram business account is not linked to the configured Facebook Page."
      };
    }

    const providerAccountName =
      (typeof ig.name === "string" && ig.name.trim()) ||
      (typeof ig.username === "string" && ig.username.trim()) ||
      undefined;

    return {
      ok: true,
      message: "Instagram connection verified.",
      metadata: {
        providerPageId: pageId,
        ...(providerAccountName ? { providerAccountName } : {})
      }
    };
  } catch (error) {
    return { ok: false, message: sanitizeProviderErrorMessage(error) };
  }
}

export async function verifyChannelHealth(
  channel: SupportedChannelSettingChannel,
  runtime: ChannelRuntimeConfig,
  fetchFn: FetchFn = fetch
): Promise<ChannelHealthCheckOutcome> {
  if (channel === "LINE") return verifyLineChannelHealth(runtime, fetchFn);
  if (channel === "FACEBOOK") return verifyFacebookChannelHealth(runtime, fetchFn);
  return verifyInstagramChannelHealth(runtime, fetchFn);
}
