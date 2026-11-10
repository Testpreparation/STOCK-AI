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
    const target = rows[anchorIndex + record.tradingDays];
    if (!target || !Number.isFinite(target.close) || target.close <= 0) return record;
    return {
      ...record,
      status: "evaluated",
      targetDate: target.date,
      actualPrice: target.close,
      error: record.predictedPrice - target.close,
      absoluteError: Math.abs(record.predictedPrice - target.close),
      absolutePercentageError: Math.abs((record.predictedPrice - target.close) / target.close) * 100
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
