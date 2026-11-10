import test from "node:test";
import assert from "node:assert/strict";
import { evaluateForecasts } from "../analysis/forecast-evaluation.js";

test("calculates error, directional accuracy and prediction-range coverage", () => {
  const result = evaluateForecasts([
    { originPrice: 100, predictedPrice: 110, actualPrice: 108, predictedLower: 95, predictedUpper: 115 },
    { originPrice: 100, predictedPrice: 90, actualPrice: 92, predictedLower: 85, predictedUpper: 95 },
    { originPrice: 100, predictedPrice: 105, actualPrice: 120, predictedLower: 98, predictedUpper: 112 }
  ]);
  assert.equal(result.status, "ok");
  assert.equal(result.sampleCount, 3);
  assert.ok(result.mae > 0);
  assert.ok(result.rmse >= result.mae);
  assert.equal(result.directionalAccuracyPercent, 100);
  assert.equal(result.rangeCoveragePercent, 66.67);
});

test("ignores invalid observations and handles missing directional/range data", () => {
  const result = evaluateForecasts([
    { predictedPrice: 10, actualPrice: 11 },
    { predictedPrice: 0, actualPrice: 12 },
    { predictedPrice: 12, actualPrice: null }
  ]);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.directionalAccuracyPercent, null);
  assert.equal(result.rangeCoveragePercent, null);
});

test("returns null metrics when there are no valid pairs", () => {
  const result = evaluateForecasts([]);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.mae, null);
  assert.equal(result.sampleCount, 0);
});
