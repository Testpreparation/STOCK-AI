import test from "node:test";
import assert from "node:assert/strict";
import { applyForecastCalibration, createForecastSnapshots, reconcileForecastHistory, summarizeForecastHistory } from "../analysis/forecast-history.js";

const dataset = {
  market: "JP",
  symbol: "7203",
  data: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    close: 100 + index
  }))
};

test("creates one immutable record per forecast horizon", () => {
  const snapshots = createForecastSnapshots(dataset, {
    market: "JP", symbol: "7203", latestDataDate: dataset.data[0].date, latestClose: 100,
    forecasts: [
      { key: "short", label: "short", tradingDays: 2, base: 105, range: { lower: 95, upper: 115 } },
      { key: "medium", label: "medium", tradingDays: 5, base: 110 }
    ]
  });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].status, "pending");
  assert.equal(snapshots[0].originPrice, 100);
  assert.equal(snapshots[0].predictedLower, 95);
});

test("resolves actual close by future trading-session index", () => {
  const snapshot = {
    id: "JP|7203|2026-01-01|short", symbol: "7203", horizon: "short",
    originDate: dataset.data[0].date, tradingDays: 2, originPrice: 100,
    predictedPrice: 103, predictedLower: 100, predictedUpper: 105, status: "pending"
  };
  const [resolved] = reconcileForecastHistory([snapshot], dataset);
  assert.equal(resolved.status, "evaluated");
  assert.equal(resolved.targetDate, dataset.data[2].date);
  assert.equal(resolved.actualPrice, 102);
  assert.equal(resolved.absoluteError, 1);
});

test("keeps forecasts pending until the target session exists", () => {
  const snapshot = { originDate: dataset.data[0].date, tradingDays: 50, status: "pending" };
  const [pending] = reconcileForecastHistory([snapshot], dataset);
  assert.equal(pending.status, "pending");
});

test("summarizes only evaluated records and reports pending count", () => {
  const history = [
    { status: "evaluated", horizon: "short", predictedPrice: 105, actualPrice: 102, originPrice: 100, predictedLower: 98, predictedUpper: 108 },
    { status: "pending", horizon: "short" },
    { status: "evaluated", horizon: "long", predictedPrice: 120, actualPrice: 125, originPrice: 100 }
  ];
  const result = summarizeForecastHistory(history, "short");
  assert.equal(result.sampleCount, 1);
  assert.equal(result.pendingCount, 1);
  assert.equal(result.mae, 3);
});

test("rebases pending predictions when historical adjusted prices are restated", () => {
  const snapshot = {
    originDate: dataset.data[0].date, tradingDays: 2, originPrice: 100,
    predictedPrice: 110, predictedReturnRatio: 1.1, status: "pending"
  };
  const revised = { data: dataset.data.map((row, index) => ({ ...row, close: row.close * 2 })) };
  const [resolved] = reconcileForecastHistory([snapshot], revised);
  assert.equal(resolved.originPrice, 200);
  assert.equal(resolved.predictedPrice, 220);
  assert.equal(resolved.actualPrice, 204);
});

test("calibrates a horizon only after five completed forecasts and caps adjustment", () => {
  const forecast = {
    latestClose: 100,
    forecasts: [{ key: "short", base: 110, bull: 120, bear: 90, range: { lower: 95, upper: 125 } }]
  };
  const history = Array.from({ length: 5 }, (_, index) => ({
    status: "evaluated", horizon: "short", predictedPrice: 100, actualPrice: 150 + index
  }));
  const [result] = applyForecastCalibration(forecast, history).forecasts;
  assert.equal(result.calibration.applied, true);
  assert.equal(result.calibration.factor, 1.1);
  assert.equal(result.base, 121);
  assert.equal(result.expectedChangePercent, 21);
});

test("does not calibrate with fewer than five completed forecasts", () => {
  const forecast = { latestClose: 100, forecasts: [{ key: "short", base: 110, bull: 120, bear: 90 }] };
  const history = [{ status: "evaluated", horizon: "short", predictedPrice: 100, actualPrice: 105 }];
  const [result] = applyForecastCalibration(forecast, history).forecasts;
  assert.equal(result.calibration.applied, false);
  assert.equal(result.base, 110);
});
