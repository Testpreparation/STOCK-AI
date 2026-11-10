import test from "node:test";
import assert from "node:assert/strict";
import { calculateStockScore, STOCK_SCORE_WEIGHTS } from "../analysis/scoring.js";

const goodFinancial = {
  symbol: "TEST", market: "US",
  dataQuality: { status: "good" },
  derived: { operatingMarginPercent: 18, liabilitiesToAssetsPercent: 35 },
  metrics: {
    revenue: { yearOverYearGrowth: { status: "calculated", value: 15 }, latest: 120 },
    operatingIncome: { yearOverYearGrowth: { status: "calculated", value: 20 }, latest: 22 },
    dilutedEps: { yearOverYearGrowth: { status: "calculated", value: 12 }, latest: 2 },
    netIncome: { latest: 18 },
    operatingCashFlow: { latest: 24 }
  }
};
const fullInput = {
  symbol: "TEST",
  financial: goodFinancial,
  valuation: { pe: 20, sectorMedianPe: 25, pb: 3, sectorMedianPb: 4 },
  technical: { closes: [110], sma20: [100], sma50: [95], rsi14: [55] },
  businessQuality: { competitivePosition: 80, managementQuality: 75, recurringRevenue: 85, governance: 90 },
  marketEnvironment: { benchmarkTrendScore: 75, marketBreadthPercent: 65, volatilityPercent: 15 },
  dataFreshness: { isStale: false, isValid: true }
};

test("weights sum to 100 and full inputs produce a complete score", () => {
  assert.equal(Object.values(STOCK_SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const result = calculateStockScore(fullInput);
  assert.equal(result.coveragePercent, 100);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.recommendation.code, "CONSIDER_BUY");
});

test("missing components reduce coverage and block buy-oriented labels", () => {
  const result = calculateStockScore({ financial: goodFinancial });
  assert.equal(result.coveragePercent, 50);
  assert.equal(result.recommendation.code, "INSUFFICIENT_COVERAGE");
  assert.equal(result.components.valuation.score, null);
});

test("stale or invalid data blocks a buy-oriented recommendation", () => {
  const stale = calculateStockScore({ ...fullInput, dataFreshness: { isStale: true, isValid: true } });
  assert.equal(stale.recommendation.code, "RISK_GUARD");
  const invalid = calculateStockScore({ ...fullInput, dataFreshness: { isStale: false, isValid: false } });
  assert.equal(invalid.recommendation.code, "RISK_GUARD");
});

test("critical risk and incomplete financial quality block buying labels", () => {
  const risk = calculateStockScore({ ...fullInput, risk: { criticalAlert: true } });
  assert.equal(risk.recommendation.code, "RISK_GUARD");
  const weak = calculateStockScore({ ...fullInput, financial: { ...goodFinancial, dataQuality: { status: "insufficient" } } });
  assert.equal(weak.recommendation.code, "RISK_GUARD");
});

test("negative or invalid valuation multiples are ignored", () => {
  const result = calculateStockScore({ ...fullInput, valuation: { pe: -5, sectorMedianPe: 20 } });
  assert.equal(result.components.valuation.score, null);
  assert.equal(result.coveragePercent, 85);
});

test("zero available components returns no score and holds recommendation", () => {
  const result = calculateStockScore({});
  assert.equal(result.score, null);
  assert.equal(result.coveragePercent, 0);
  assert.equal(result.recommendation.code, "INSUFFICIENT_COVERAGE");
});
