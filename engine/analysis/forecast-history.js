import { evaluateForecasts } from "./forecast-evaluation.js";

/**
 * Forecast snapshots are immutable records keyed by symbol, origin date and horizon.
 * Actual prices are matched by trading-session index, not calendar-day arithmetic.
 */
export function createForecastSnapshots(dataset, forecast) {
  if (!dataset || !Array.isArray(dataset.data) || !forecast || !Array.isArray(forecast.forecasts)) return [];
  const symbol = dataset.symbol ?? forecast.symbol;
  const originDate = forecast.latestDataDate;
  const originIndex = dataset.data.findIndex(row => row?.date === originDate);
  if (!symbol || !originDate || originIndex < 0 || !Number.isFinite(forecast.latestClose)) return [];
  return forecast.forecasts
    .filter(item => Number.isInteger(item.tradingDays) && item.tradingDays > 0 && Number.isFinite(item.base) && item.base > 0)
    .map(item => ({
      id: [forecast.market ?? dataset.market ?? "UNKNOWN", symbol, originDate, item.key].join("|"),
      market: forecast.market ?? dataset.market ?? "UNKNOWN",
      symbol,
      horizon: item.key,
      horizonLabel: item.label,
      tradingDays: item.tradingDays,
      originDate,
      originIndex,
      originPrice: forecast.latestClose,
      predictedReturnRatio: item.base / forecast.latestClose,
      predictedPrice: item.base,
      predictedLower: item.range?.lower ?? null,
      predictedUpper: item.range?.upper ?? null,
      status: "pending",
      targetDate: null,
      actualPrice: null
    }));
}

/** Resolve pending forecasts once the corresponding future trading session exists. */
export function reconcileForecastHistory(history, dataset) {
  if (!Array.isArray(history) || !dataset || !Array.isArray(dataset.data)) {
    throw new TypeError("history and dataset.data are required");
  }
  const rows = dataset.data;
  return history.map(record => {
    if (record.status === "evaluated" || record.status === "invalid") return record;
    const anchorIndex = rows.findIndex(row => row?.date === record.originDate);
    if (anchorIndex < 0) return record;
    const anchor = rows[anchorIndex];
    const target = rows[anchorIndex + record.tradingDays];
    if (!target || !Number.isFinite(anchor?.close) || anchor.close <= 0 || !Number.isFinite(target.close) || target.close <= 0) return record;
    const rebasedFactor = Number.isFinite(record.predictedReturnRatio) && Number.isFinite(record.originPrice) && record.originPrice > 0 ? anchor.close / record.originPrice : 1;
    const predictedPrice = record.predictedPrice * rebasedFactor;
    const predictedLower = Number.isFinite(record.predictedLower) ? record.predictedLower * rebasedFactor : record.predictedLower;
    const predictedUpper = Number.isFinite(record.predictedUpper) ? record.predictedUpper * rebasedFactor : record.predictedUpper;
    return {
      ...record,
      originPrice: anchor.close,
      predictedPrice,
      predictedLower,
      predictedUpper,
      status: "evaluated",
      targetDate: target.date,
      actualPrice: target.close,
      error: predictedPrice - target.close,
      absoluteError: Math.abs(predictedPrice - target.close),
      absolutePercentageError: Math.abs((predictedPrice - target.close) / target.close) * 100
    };
  });
}

export function summarizeForecastHistory(history, horizon = null) {
  if (!Array.isArray(history)) throw new TypeError("history must be an array");
  const selected = history.filter(record =>
    record.status === "evaluated" &&
    (!horizon || record.horizon === horizon)
  );
  const metrics = evaluateForecasts(selected.map(record => ({
    predictedPrice: record.predictedPrice,
    actualPrice: record.actualPrice,
    originPrice: record.originPrice,
    predictedLower: record.predictedLower,
    predictedUpper: record.predictedUpper
  })));
  return {
    ...metrics,
    pendingCount: history.filter(record => record.status === "pending" && (!horizon || record.horizon === horizon)).length
  };
}

/**
 * Apply a conservative per-horizon bias correction after enough completed forecasts.
 * The median actual/predicted ratio limits sensitivity to outliers.
 */
export function applyForecastCalibration(forecast, history, options = {}) {
  if (!forecast || !Array.isArray(forecast.forecasts)) return forecast;
  const minSamples = options.minSamples ?? 5;
  const maxCorrection = options.maxCorrectionPercent ?? 10;
  const calibrated = forecast.forecasts.map(item => {
    const completed = (Array.isArray(history) ? history : []).filter(record => record.status === "evaluated" && record.horizon === item.key && Number.isFinite(record.predictedPrice) && record.predictedPrice > 0 && Number.isFinite(record.actualPrice) && record.actualPrice > 0);
    const ratios = completed.map(record => record.actualPrice / record.predictedPrice).sort((a, b) => a - b);
    const middle = Math.floor(ratios.length / 2);
    const medianRatio = ratios.length ? (ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2) : 1;
    const limit = maxCorrection / 100;
    const factor = ratios.length >= minSamples ? Math.min(1 + limit, Math.max(1 - limit, medianRatio)) : 1;
    const scale = value => Number.isFinite(value) ? Math.round(value * factor * 100) / 100 : value;
    const base = scale(item.base);
    return { ...item, base, bull: scale(item.bull), bear: scale(item.bear), range: item.range ? { lower: scale(item.range.lower), upper: scale(item.range.upper) } : item.range, expectedChangePercent: Number.isFinite(forecast.latestClose) && forecast.latestClose > 0 ? Math.round((base / forecast.latestClose - 1) * 10000) / 100 : item.expectedChangePercent, calibration: { applied: ratios.length >= minSamples, factor, sampleCount: ratios.length } };
  });
  return { ...forecast, forecasts: calibrated, calibrationMethod: "median_bias_correction" };
}
