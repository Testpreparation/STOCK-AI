const BASE_URL = "https://api.jquants.com/v2/equities/bars/daily";

export class ProviderError extends Error {
  constructor(message, code = "PROVIDER_ERROR", status = null) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

/**
 * J-Quants API V2 daily OHLCV adapter.
 * Keep this server-side: never expose the API key in browser code.
 * Free-plan data is delayed by 12 weeks; callers must preserve that limitation.
 */
export async function fetchJQuantsDaily({
  apiKey,
  code,
  from,
  to,
  fetchImpl = globalThis.fetch,
  baseUrl = BASE_URL
} = {}) {
  if (!apiKey || !String(apiKey).trim()) throw new ProviderError("J-Quants API key is required", "MISSING_API_KEY");
  if (!code || !/^\d{4,5}$/.test(String(code))) throw new ProviderError("A valid 4- or 5-character Japanese stock code is required", "INVALID_CODE");
  if (typeof fetchImpl !== "function") throw new ProviderError("Fetch implementation is unavailable", "FETCH_UNAVAILABLE");

  const params = new URLSearchParams({ code: String(code) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const rows = [];
  let next = null;
  do {
    if (next) params.set("pagination_key", next);
    const url = new URL(baseUrl);
    url.search = params.toString();
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "x-api-key": String(apiKey).trim(), "accept": "application/json" }
    });
    if (!response.ok) {
      const status = response.status;
      const code = status === 429 ? "RATE_LIMITED" : status === 403 ? "AUTH_OR_PLAN_ERROR" : "HTTP_ERROR";
      throw new ProviderError(`J-Quants request failed (HTTP ${status})`, code, status);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) throw new ProviderError("Unexpected J-Quants response shape", "INVALID_RESPONSE");
    rows.push(...payload.data);
    next = payload.pagination_key || null;
  } while (next);

  return {
    provider: "jquants",
    market: "JP",
    symbol: String(code),
    currency: "JPY",
    fetchedAt: new Date().toISOString(),
    delayPolicy: "FREE_PLAN_12_WEEK_DELAY",
    rows
  };
}
