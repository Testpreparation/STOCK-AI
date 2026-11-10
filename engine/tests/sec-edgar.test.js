import test from "node:test";
import assert from "node:assert/strict";
import { fetchSecCompanyFacts, SecEdgarError } from "../data/providers/sec-edgar.js";

const fixture = {
  entityName: "Example Corporation",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: [
          { fy: 2024, form: "10-K", start: "2024-01-01", end: "2024-12-31", filed: "2025-02-20", val: 1200 },
          { fy: 2024, form: "10-K", start: "2024-10-01", end: "2024-12-31", filed: "2025-02-20", val: 300 },
          { fy: 2023, form: "10-K", start: "2023-01-01", end: "2023-12-31", filed: "2024-02-20", val: 1000 },
          { fy: 2024, form: "10-Q", end: "2024-09-30", filed: "2024-11-01", val: 900 }
        ] }
      },
      Assets: { units: { USD: [
        { fy: 2024, form: "10-K", end: "2024-12-31", filed: "2025-02-20", val: 5000 }
      ] } },
      OperatingIncomeLoss: { units: { USD: [
        { fy: 2024, form: "10-K", start: "2024-01-01", end: "2024-12-31", filed: "2025-02-20", val: 180 }
      ] } },
      EarningsPerShareDiluted: { units: { "USD / shares": [
        { fy: 2024, form: "10-K", start: "2024-01-01", end: "2024-12-31", filed: "2025-02-20", val: 3.25 }
      ] } }
    }
  }
};

test("SEC adapter pads CIK, sends identifying User-Agent and extracts annual facts", async () => {
  let request;
  const result = await fetchSecCompanyFacts({
    cik: "320193",
    userAgent: "STOCK-AI contact@example.com",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => fixture };
    }
  });
  assert.match(request.url, /CIK0000320193\.json$/);
  assert.equal(request.options.headers["User-Agent"], "STOCK-AI contact@example.com");
  assert.equal(result.entityName, "Example Corporation");
  assert.equal(result.metrics.revenue.length, 2);
  assert.equal(result.metrics.revenue.at(-1).value, 1200);
  assert.equal(result.metrics.totalAssets[0].value, 5000);
  assert.equal(result.metrics.operatingIncome[0].value, 180);
  assert.equal(result.metrics.dilutedEps[0].unit, "USD / shares");
  assert.deepEqual(result.availableMetrics.sort(), ["dilutedEps", "operatingIncome", "revenue", "totalAssets"]);
});

test("SEC adapter requires valid CIK and identifying User-Agent", async () => {
  await assert.rejects(() => fetchSecCompanyFacts({ cik: "ABC", userAgent: "STOCK-AI contact@example.com" }), error => error.code === "INVALID_CIK");
  await assert.rejects(() => fetchSecCompanyFacts({ cik: "320193" }), error => error instanceof SecEdgarError && error.code === "MISSING_USER_AGENT");
});

test("SEC adapter reports rate limiting without hiding it", async () => {
  await assert.rejects(
    () => fetchSecCompanyFacts({
      cik: "320193", userAgent: "STOCK-AI contact@example.com",
      fetchImpl: async () => ({ ok: false, status: 429 })
    }),
    error => error.code === "RATE_LIMITED" && error.status === 429
  );
});

test("SEC adapter preserves missing metrics instead of fabricating values", async () => {
  const result = await fetchSecCompanyFacts({
    cik: "320193", userAgent: "STOCK-AI contact@example.com",
    fetchImpl: async () => ({ ok: true, json: async () => ({ facts: { "us-gaap": {} } }) })
  });
  assert.deepEqual(result.metrics.revenue, []);
  assert.deepEqual(result.availableMetrics, []);
});
