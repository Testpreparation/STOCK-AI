const BASE_URL = "https://www.alphavantage.co/query";
export class AlphaVantageError extends Error {
  constructor(message, code = "ALPHA_VANTAGE_ERROR", status = null) {
    super(message); this.name = "AlphaVantageError"; this.code = code; this.status = status;
  }
}
export async function fetchAlphaVantageDaily({ apiKey, symbol, fetchImpl = globalThis.fetch, baseUrl = BASE_URL } = {}) {
  if (!apiKey || !String(apiKey).trim()) throw new AlphaVantageError("Alpha Vantage API key is required", "MISSING_API_KEY");
  const ticker = String(symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.^_-]{1,20}$/.test(ticker)) throw new AlphaVantageError("Invalid US ticker symbol", "INVALID_SYMBOL");
  if (typeof fetchImpl !== "function") throw new AlphaVantageError("Fetch implementation is unavailable", "FETCH_UNAVAILABLE");
  const url = new URL(baseUrl);
  url.search = new URLSearchParams({ function: "TIME_SERIES_DAILY", symbol: ticker, outputsize: "compact", apikey: String(apiKey).trim() }).toString();
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR";
    throw new AlphaVantageError(`Alpha Vantage request failed (HTTP ${response.status})`, code, response.status);
  }
  const payload = await response.json();
  if (payload?.["Error Message"]) throw new AlphaVantageError(String(payload["Error Message"]), "API_ERROR");
  if (payload?.Note || payload?.Information) throw new AlphaVantageError(String(payload.Note ?? payload.Information), "RATE_LIMITED");
  const seriesKey = Object.keys(payload ?? {}).find(key => key.includes("Time Series"));
  const series = seriesKey ? payload[seriesKey] : null;
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    throw new AlphaVantageError("Daily time series is missing from response", "INVALID_RESPONSE");
  }
  const rows = Object.entries(series).map(([date, values]) => ({
    date,
    open: Number(values["1. open"]),
    high: Number(values["2. high"]),
    low: Number(values["3. low"]),
    close: Number(values["4. close"]),
    volume: Number(values["5. volume"])
  })).sort((a,b) => a.date.localeCompare(b.date));
  if (!rows.length || rows.some(row => !["open", "high", "low", "close", "volume"].every(key => Number.isFinite(row[key])))) {
    throw new AlphaVantageError("Daily response contains invalid OHLCV rows", "INVALID_DATA");
  }
  return {
    provider: "alpha-vantage",
    market: "US",
    symbol: ticker,
    currency: "USD",
    fetchedAt: new Date().toISOString(),
    priceAdjustment: "RAW_UNADJUSTED",
    historyPolicy: "FREE_COMPACT_LATEST_100",
    rows
  };
}
