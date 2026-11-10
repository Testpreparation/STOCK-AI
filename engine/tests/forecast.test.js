import test from "node:test";
import assert from "node:assert/strict";
import { forecastPrices } from "../analysis/forecast.js";

function makeRows(count = 300, start = "2025-01-02", drift = 0.0004) {
  const rows = [];
  let close = 100;
  const date = new Date(start + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) { i--; continue; }
    close *= Math.exp(drift + Math.sin(i / 5) * 0.004);
    rows.push({ date: date.toISOString().slice(0, 10), close: Number(close.toFixed(4)) });
  }
  return rows;
}

test("creates three horizons with bull/base/bear scenarios and uncertainty ranges", () => {
  const result = forecastPrices({ symbol: "TEST", market: "US", currency: "USD", data: makeRows() });
  assert.equal(result.status, "ok");
  assert.equal(result.forecasts.length, 3);
  for (const item of result.forecasts) {
    assert.ok(item.bull > item.base);
    assert.ok(item.base > item.bear);
    assert.ok(item.range.upper > item.range.lower);
    assert.ok(item.uncertaintyPercent >= 0);
  }
  assert.equal(result.forecasts[0].tradingDays, 20);
  assert.equal(result.forecasts[1].tradingDays, 63);
  assert.equal(result.forecasts[2].tradingDays, 252);
});

test("insufficient observations never produces a price target", () => {
  const result = forecastPrices({ data: makeRows(40) });
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.forecasts.length, 0);
});

test("stale data is explicitly flagged and disallows decision use", () => {
  const rows = makeRows();
  const result = forecastPrices({ data: rows }, { asOfDate: "2026-11-10" });
  assert.equal(result.status, "stale_data");
  assert.equal(result.decisionAllowed, false);
});

test("rejects unsorted or duplicate dates", () => {
  const rows = makeRows();
  const result = forecastPrices({ data: [rows[1], rows[0], ...rows.slice(2)] });
  assert.equal(result.status, "invalid_data");
});

test("rejects an as-of date earlier than the latest observation", () => {
  const rows = makeRows();
  const result = forecastPrices({ data: rows }, { asOfDate: "2025-01-01" });
  assert.equal(result.status, "invalid_data");
});

test("uses only historical observations and is deterministic", () => {
  const rows = makeRows();
  const a = forecastPrices({ data: rows });
  const b = forecastPrices({ data: rows });
  assert.deepEqual(a, b);
});
