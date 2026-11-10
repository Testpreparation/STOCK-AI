import test from "node:test";
import assert from "node:assert/strict";
import { fetchJQuantsDaily, ProviderError } from "../data/providers/jquants.js";

test("J-Quants adapter sends V2 API key and normalizes pagination", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const page = calls.length;
    return {
      ok: true,
      json: async () => page === 1
        ? { data: [{ Date: "2026-01-05", O: 100, H: 110, L: 95, C: 105, Vo: 1000 }], pagination_key: "next-page" }
        : { data: [{ Date: "2026-01-06", O: 105, H: 112, L: 101, C: 109, Vo: 1200 }] }
    };
  };
  const result = await fetchJQuantsDaily({
    apiKey: "test-key", code: "7203", from: "2026-01-01", to: "2026-01-31", fetchImpl
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.delayPolicy, "FREE_PLAN_12_WEEK_DELAY");
  assert.equal(calls[0].options.headers["x-api-key"], "test-key");
  assert.match(calls[1].url, /pagination_key=next-page/);
});

test("J-Quants adapter rejects missing credentials and invalid codes", async () => {
  await assert.rejects(() => fetchJQuantsDaily({ code: "7203" }), error => error instanceof ProviderError && error.code === "MISSING_API_KEY");
  await assert.rejects(() => fetchJQuantsDaily({ apiKey: "x", code: "abc" }), error => error.code === "INVALID_CODE");
});

test("J-Quants adapter classifies rate-limit errors", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429 });
  await assert.rejects(
    () => fetchJQuantsDaily({ apiKey: "x", code: "7203", fetchImpl }),
    error => error.code === "RATE_LIMITED" && error.status === 429
  );
});

import { normalizePriceRows } from "../data/normalizer.js";

test("normalizer supports J-Quants V2 adjusted OHLCV columns", () => {
  const normalized = normalizePriceRows([
    { Date: "2026-01-05", AdjO: 99, AdjH: 111, AdjL: 94, AdjC: 106, AdjVo: 1500 }
  ], { symbol: "7203", market: "JP", source: "jquants" });
  assert.deepEqual(
    (({ open, high, low, close, volume }) => ({ open, high, low, close, volume }))(normalized.data[0]),
    { open: 99, high: 111, low: 94, close: 106, volume: 1500 }
  );
});
