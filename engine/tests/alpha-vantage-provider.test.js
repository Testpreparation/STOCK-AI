import test from "node:test";
import assert from "node:assert/strict";
import { fetchAlphaVantageDaily, AlphaVantageError } from "../data/providers/alpha-vantage.js";

test("parses and sorts Alpha Vantage daily OHLCV response", async () => {
  let requested;
  const result = await fetchAlphaVantageDaily({
    apiKey: "test-key", symbol: "aapl",
    fetchImpl: async url => {
      requested = new URL(url);
      return { ok: true, json: async () => ({
        "Meta Data": { "2. Symbol": "AAPL" },
        "Time Series (Daily)": {
          "2026-01-06": { "1. open":"102","2. high":"105","3. low":"100","4. close":"104","5. volume":"2000" },
          "2026-01-05": { "1. open":"99","2. high":"103","3. low":"98","4. close":"102","5. volume":"1500" }
        }
      }) };
    }
  });
  assert.equal(requested.searchParams.get("function"), "TIME_SERIES_DAILY");
  assert.equal(requested.searchParams.get("outputsize"), "compact");
  assert.equal(requested.searchParams.get("apikey"), "test-key");
  assert.equal(result.symbol, "AAPL");
  assert.equal(result.priceAdjustment, "RAW_UNADJUSTED");
  assert.deepEqual(result.rows.map(row => row.date), ["2026-01-05","2026-01-06"]);
  assert.equal(result.rows[0].close, 102);
});

test("classifies missing credentials, API throttling and malformed payloads", async () => {
  await assert.rejects(() => fetchAlphaVantageDaily({ symbol: "AAPL" }), e => e instanceof AlphaVantageError && e.code === "MISSING_API_KEY");
  await assert.rejects(() => fetchAlphaVantageDaily({ apiKey: "x", symbol: "AAPL", fetchImpl: async () => ({ ok:true, json:async()=>({ Note:"limit reached" }) }) }), e => e.code === "RATE_LIMITED");
  await assert.rejects(() => fetchAlphaVantageDaily({ apiKey: "x", symbol: "AAPL", fetchImpl: async () => ({ ok:true, json:async()=>({ Information:"premium only" }) }) }), e => e.code === "RATE_LIMITED");
  await assert.rejects(() => fetchAlphaVantageDaily({ apiKey: "x", symbol: "AAPL", fetchImpl: async () => ({ ok:true, json:async()=>({ foo:"bar" }) }) }), e => e.code === "INVALID_RESPONSE");
});
