import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnnualFinancials } from "../data/financial-normalizer.js";
import { analyzeFinancials } from "../analysis/financial.js";

const fact = (fiscalYearEnd, value, unit = "USD") => ({
  fiscalYearEnd, fiscalYear: Number(fiscalYearEnd.slice(0, 4)),
  filedAt: fiscalYearEnd + "-02-01", value, unit, sourceTag: "fixture"
});

function sampleProvider(metrics = {}) {
  return { provider: "test", entityName: "Test Co", fetchedAt: "2026-01-01T00:00:00.000Z", metrics };
}

test("normalizer joins metrics by fiscal year and keeps missing facts null", () => {
  const normalized = normalizeAnnualFinancials(sampleProvider({
    revenue: [fact("2023-12-31", 100), fact("2024-12-31", 120)],
    netIncome: [fact("2024-12-31", 12)]
  }), { symbol: "test", market: "US", currency: "USD" });
  assert.equal(normalized.symbol, "TEST");
  assert.equal(normalized.periods.length, 2);
  assert.equal(normalized.periods[1].metrics.revenue.value, 120);
  assert.equal(normalized.periods[0].metrics.netIncome, null);
});

test("normalizer chooses the latest filed fact for duplicate periods", () => {
  const normalized = normalizeAnnualFinancials(sampleProvider({
    revenue: [
      { ...fact("2024-12-31", 100), filedAt: "2025-02-01" },
      { ...fact("2024-12-31", 110), filedAt: "2025-03-01" }
    ]
  }));
  assert.equal(normalized.periods[0].metrics.revenue.value, 110);
});

test("analysis calculates growth, margin and liabilities-to-assets", () => {
  const data = normalizeAnnualFinancials(sampleProvider({
    revenue: [fact("2023-12-31", 100), fact("2024-12-31", 125)],
    operatingIncome: [fact("2023-12-31", 10), fact("2024-12-31", 20)],
    netIncome: [fact("2023-12-31", 5), fact("2024-12-31", 10)],
    dilutedEps: [fact("2023-12-31", 1), fact("2024-12-31", 2)],
    totalAssets: [fact("2024-12-31", 200)],
    totalLiabilities: [fact("2024-12-31", 80)],
    operatingCashFlow: [fact("2024-12-31", 15)]
  }));
  const result = analyzeFinancials(data);
  assert.equal(result.metrics.revenue.yearOverYearGrowth.value, 25);
  assert.equal(result.derived.operatingMarginPercent, 16);
  assert.equal(result.derived.liabilitiesToAssetsPercent, 40);
  assert.equal(result.dataQuality.status, "good");
});

test("analysis labels loss-to-profit as turnaround, not an infinite growth rate", () => {
  const data = normalizeAnnualFinancials(sampleProvider({
    netIncome: [fact("2023-12-31", -20), fact("2024-12-31", 5)]
  }));
  const result = analyzeFinancials(data);
  assert.equal(result.metrics.netIncome.yearOverYearGrowth.value, null);
  assert.equal(result.metrics.netIncome.yearOverYearGrowth.status, "turnaround");
  assert.ok(result.signals.some(signal => signal.name === "netIncome" && signal.status === "turnaround"));
});

test("analysis suppresses growth when units differ and warns on thin coverage", () => {
  const data = normalizeAnnualFinancials(sampleProvider({
    revenue: [fact("2023-12-31", 100, "USD"), fact("2024-12-31", 120, "EUR")]
  }));
  const result = analyzeFinancials(data);
  assert.equal(result.metrics.revenue.yearOverYearGrowth.status, "mixed-units");
  assert.equal(result.dataQuality.status, "insufficient");
});

test("analysis handles zero baseline, negative trend and empty input safely", () => {
  const zero = normalizeAnnualFinancials(sampleProvider({
    revenue: [fact("2023-12-31", 0), fact("2024-12-31", 10)]
  }));
  assert.equal(analyzeFinancials(zero).metrics.revenue.yearOverYearGrowth.status, "zero-baseline");

  const empty = analyzeFinancials(normalizeAnnualFinancials(sampleProvider()));
  assert.equal(empty.latestPeriod, null);
  assert.equal(empty.dataQuality.status, "insufficient");
});
