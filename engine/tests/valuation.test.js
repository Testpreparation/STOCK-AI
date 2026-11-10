import test from "node:test";
import assert from "node:assert/strict";
import { calculateValuationIndicators } from "../analysis/valuation.js";

test("calculates PER, PBR and transparent EPS multiple scenarios", () => {
  const result = calculateValuationIndicators({
    price: 150,
    financial: {
      metrics: {
        dilutedEps: { latest: 10, yearOverYearGrowth: { status: "calculated", value: 12 } },
        netIncome: { latest: 1000 },
        stockholdersEquity: { latest: 5000 },
        revenue: { latest: 8000 }
      }
    }
  });
  assert.equal(result.pe, 15);
  assert.equal(result.bookValuePerShare, 50);
  assert.equal(result.pb, 3);
  assert.equal(result.scenarios.conservative, 100);
  assert.equal(result.scenarios.base, 160);
  assert.equal(result.scenarios.optimistic, 220);
  assert.equal(result.status, "available");
});

test("does not invent valuation when EPS or price is unavailable", () => {
  const result = calculateValuationIndicators({ price: null, financial: { metrics: {} } });
  assert.equal(result.pe, null);
  assert.equal(result.pb, null);
  assert.equal(result.scenarios, null);
  assert.equal(result.status, "insufficient_data");
});

test("does not calculate PBR without reliable implied share count", () => {
  const result = calculateValuationIndicators({
    price: 100,
    financial: { metrics: { dilutedEps: { latest: 0 }, netIncome: { latest: 50 }, stockholdersEquity: { latest: 1000 } } }
  });
  assert.equal(result.pb, null);
});
