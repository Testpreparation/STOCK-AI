import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInstrument, getEngineCapabilities } from "../pipeline.js";

function priceRows(count = 300) {
  const rows = [];
  let close = 100;
  const date = new Date("2025-01-01T00:00:00Z");
  while (rows.length < count) {
    date.setUTCDate(date.getUTCDate() + 1);
    if ([0, 6].includes(date.getUTCDay())) continue;
    close *= 1.0005;
    rows.push({
      date: date.toISOString().slice(0, 10),
      open: close * 0.999,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 10000
    });
  }
  return rows;
}
const financialData = {
  symbol: "TEST", market: "US", currency: "USD", provider: "fixture",
  periods: ["2023-12-31", "2024-12-31"].map((date, index) => ({
    fiscalYearEnd: date,
    metrics: {
      revenue: { value: 100 + index * 20, unit: "USD" },
      operatingIncome: { value: 15 + index * 4, unit: "USD" },
      netIncome: { value: 10 + index * 3, unit: "USD" },
      dilutedEps: { value: 1 + index * 0.2, unit: "USD/share" },
      totalAssets: { value: 200, unit: "USD" },
      totalLiabilities: { value: 80, unit: "USD" },
      operatingCashFlow: { value: 20 + index * 4, unit: "USD" }
    }
  }))
};

test("integrates normalized prices, technicals, financial analysis, score and forecasts", () => {
  const rows = priceRows();
  const result = analyzeInstrument({
    priceDataset: { schemaVersion: 1, symbol: "TEST", market: "US", currency: "USD", source: "fixture", data: rows },
    financialData,
    asOf: rows.at(-1).date + "T00:00:00Z",
    valuation: { pe: 20, sectorMedianPe: 25, pb: 2, sectorMedianPb: 3 },
    businessQuality: { competitivePosition: 70, managementQuality: 70, recurringRevenue: 70, governance: 70 },
    marketEnvironment: { benchmarkTrendScore: 60, marketBreadthPercent: 60, volatilityPercent: 20 }
  });
  assert.equal(result.dataQuality.valid, true);
  assert.equal(result.technical.latest.close, rows.at(-1).close);
  assert.equal(result.financial.dataQuality.status, "good");
  assert.ok(Number.isFinite(result.score.score));
  assert.equal(result.forecast.status, "ok");
  assert.equal(result.forecast.forecasts.length, 3);
});

test("stale prices block buy-oriented labels and stale forecast use", () => {
  const rows = priceRows();
  const result = analyzeInstrument({
    priceDataset: { schemaVersion: 1, symbol: "TEST", market: "US", data: rows },
    asOf: "2026-11-10T00:00:00Z"
  });
  assert.equal(result.dataQuality.safeForPurchaseDecision, false);
  assert.equal(result.score.recommendation.code, "INSUFFICIENT_COVERAGE");
  assert.equal(result.forecast.status, "stale_data");
});

test("rejects missing price dataset and exposes honest integration status", () => {
  assert.throws(() => analyzeInstrument({}), /priceDataset.data/);
  const capabilities = getEngineCapabilities();
  assert.equal(capabilities.technicalIndicators, true);
  assert.equal(capabilities.liveProviderConnection, false);
  assert.equal(capabilities.automaticTrading, false);
});

test("invalid rows are not used for calculations and invalidate purchase eligibility", () => {
  const rows = priceRows();
  rows[10] = { ...rows[10], high: rows[10].low - 1 };
  const result = analyzeInstrument({
    priceDataset: { schemaVersion: 1, symbol: "TEST", market: "US", data: rows },
    asOf: rows.at(-1).date + "T00:00:00Z"
  });
  assert.equal(result.dataQuality.valid, false);
  assert.equal(result.dataQuality.rejectedRows, 1);
  assert.equal(result.score.recommendation.code, "INSUFFICIENT_COVERAGE");
});
