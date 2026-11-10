import test from "node:test";
import assert from "node:assert/strict";
import { normalizePriceRows } from "../data/normalizer.js";
import { validatePriceDataset } from "../data/validator.js";
import { sma, ema, rsi, calculateTechnicalIndicators } from "../analysis/technical.js";

const fixtures = [
  { Date: "2026-11-06", Open: "100", High: "110", Low: "95", Close: "105", Volume: "1200" },
  { Date: "2026-11-05", Open: 90, High: 105, Low: 88, Close: 100, Volume: 1000 }
];

test("normalizes provider field names and numeric strings", () => {
  const data = normalizePriceRows(fixtures, { symbol: "7203", market: "JP" });
  assert.equal(data.symbol, "7203");
  assert.equal(data.data[0].close, 105);
});
test("valid rows are sorted and freshness is assessed", () => {
  const result = validatePriceDataset(normalizePriceRows(fixtures), { asOf: "2026-11-07T00:00:00Z", maxAgeDays: 5 });
  assert.equal(result.valid, true);
  assert.equal(result.accepted[0].date, "2026-11-05");
  assert.equal(result.quality.freshness, "FRESH");
  assert.equal(result.safeForPurchaseDecision, true);
});
test("rejects invalid OHLC and duplicate dates", () => {
  const rows = normalizePriceRows([
    { date: "2026-11-05", open: 10, high: 8, low: 9, close: 10, volume: 1 },
    { date: "2026-11-05", open: 10, high: 11, low: 9, close: 10, volume: 1 }
  ]);
  const result = validatePriceDataset(rows, { asOf: "2026-11-06T00:00:00Z" });
  assert.equal(result.valid, false);
  assert.equal(result.rejected.length, 2);
});
test("stale prices block purchase-decision eligibility", () => {
  const result = validatePriceDataset(normalizePriceRows(fixtures), { asOf: "2026-12-01T00:00:00Z" });
  assert.equal(result.quality.freshness, "STALE");
  assert.equal(result.safeForPurchaseDecision, false);
});
test("SMA EMA and RSI calculations", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 3), [null, null, 2, 3]);
  assert.equal(ema([1, 2, 3, 4], 3)[2], 2);
  assert.equal(ema([1, 2, 3, 4], 3)[3], 3);
  assert.equal(rsi(Array(15).fill(10), 14)[14], 50);
  assert.equal(rsi(Array.from({ length: 15 }, (_, i) => i + 1), 14)[14], 100);
});
test("indicator bundle returns aligned arrays", () => {
  const result = calculateTechnicalIndicators(Array.from({ length: 60 }, (_, i) => ({ close: 100 + i })));
  assert.equal(result.sma20.length, 60);
  assert.equal(result.sma50.length, 60);
  assert.equal(result.rsi14[59], 100);
});
