/**
 * Evaluate stored forecast snapshots against subsequently observed prices.
 * Each record: { predictedPrice, actualPrice, predictedLower?, predictedUpper?, originPrice? }.
 */
export function evaluateForecasts(records) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const valid = records.filter(row =>
    Number.isFinite(row?.predictedPrice) && row.predictedPrice > 0 &&
    Number.isFinite(row?.actualPrice) && row.actualPrice > 0
  );
  if (!valid.length) {
    return { status: "insufficient_data", sampleCount: 0, mae: null, rmse: null, mapePercent: null, directionalAccuracyPercent: null, rangeCoveragePercent: null };
  }
  const errors = valid.map(row => row.predictedPrice - row.actualPrice);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  const mape = valid.reduce((sum, row) => sum + Math.abs((row.predictedPrice - row.actualPrice) / row.actualPrice) * 100, 0) / valid.length;
  const directional = valid.filter(row =>
    Number.isFinite(row.originPrice) && row.originPrice > 0 &&
    Math.sign(row.predictedPrice - row.originPrice) === Math.sign(row.actualPrice - row.originPrice)
  );
  const ranged = valid.filter(row => Number.isFinite(row.predictedLower) && Number.isFinite(row.predictedUpper) && row.predictedLower <= row.predictedUpper);
  const covered = ranged.filter(row => row.actualPrice >= row.predictedLower && row.actualPrice <= row.predictedUpper);
  return {
    status: "ok",
    sampleCount: valid.length,
    mae: round(mae),
    rmse: round(rmse),
    mapePercent: round(mape, 3),
    directionalAccuracyPercent: directional.length ? round(directional.length / valid.length * 100, 2) : null,
    directionalSampleCount: directional.length,
    rangeCoveragePercent: ranged.length ? round(covered.length / ranged.length * 100, 2) : null,
    rangeSampleCount: ranged.length
  };
}
function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
