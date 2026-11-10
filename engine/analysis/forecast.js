const HORIZONS = [
  { key: "short", label: "短期（1〜4週間）", tradingDays: 20 },
  { key: "medium", label: "中期（1〜3か月）", tradingDays: 63 },
  { key: "long", label: "長期（6〜12か月）", tradingDays: 252 }
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const sampleStdDev = values => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
};
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position), fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
};
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));

/**
 * Deterministic scenario forecast from historical adjusted closes.
 * This is a transparent statistical projection, not a machine-learning prediction.
 */
export function forecastPrices(input, options = {}) {
  const rows = input?.data ?? input?.rows;
  if (!Array.isArray(rows)) throw new TypeError("input.data must be an array");
  const minObservations = options.minObservations ?? 60;
  const usable = [];
  let previousDate = null;
  for (const row of rows) {
    if (!validDate(row?.date) || !Number.isFinite(row?.close) || row.close <= 0) continue;
    if (previousDate && row.date <= previousDate) {
      return { status: "invalid_data", reason: "日付は重複せず古い順に並んでいる必要があります", forecasts: [] };
    }
    previousDate = row.date;
    usable.push({ date: row.date, close: row.close });
  }
  if (usable.length < minObservations) {
    return { status: "insufficient_data", reason: `予測には最低${minObservations}営業日の有効な終値が必要です`, observations: usable.length, forecasts: [] };
  }
  const latest = usable.at(-1);
  const asOfDate = options.asOfDate ?? latest.date;
  if (!validDate(asOfDate) || asOfDate < latest.date) {
    return { status: "invalid_data", reason: "asOfDateは最新データ日以降の日付にしてください", forecasts: [] };
  }
  const ageDays = Math.floor((Date.parse(asOfDate + "T00:00:00Z") - Date.parse(latest.date + "T00:00:00Z")) / 86400000);
  const stale = options.isStale === true || ageDays > (options.maxDataAgeDays ?? 10);
  const closes = usable.map(row => row.close);
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const clippedLow = quantile(returns, 0.05), clippedHigh = quantile(returns, 0.95);
  const robustReturns = returns.map(value => clamp(value, clippedLow, clippedHigh));
  const recent20 = robustReturns.slice(-20);
  const recent60 = robustReturns.slice(-60);
  const longTerm = robustReturns;
  const dailyDrift = clamp(
    mean(recent20) * 0.45 + mean(recent60) * 0.35 + mean(longTerm) * 0.20,
    -0.0015, 0.0015
  );
  const dailyVolatility = sampleStdDev(robustReturns);
  const recentVolatility = sampleStdDev(recent60);
  const volatilityRatio = dailyVolatility > 0 ? recentVolatility / dailyVolatility : 1;
  const stability = clamp(1 - Math.abs(volatilityRatio - 1) * 0.25, 0.45, 1);
  const quantityFactor = clamp(usable.length / 252, 0.35, 1);
  const volatilityFactor = clamp(1 - dailyVolatility * 18, 0.35, 1);
  const confidence = Math.round(100 * quantityFactor * stability * volatilityFactor);
  const forecasts = HORIZONS.map(horizon => {
    const days = horizon.tradingDays;
    const sigma = dailyVolatility * Math.sqrt(days);
    const base = latest.close * Math.exp(dailyDrift * days);
    const scenarioShift = 1.25 * dailyVolatility * days;
    const lower = latest.close * Math.exp(dailyDrift * days - 1.28 * sigma);
    const upper = latest.close * Math.exp(dailyDrift * days + 1.28 * sigma);
    return {
      ...horizon,
      tradingDays: days,
      base: round(base),
      bull: round(latest.close * Math.exp((dailyDrift * days) + scenarioShift)),
      bear: round(latest.close * Math.exp((dailyDrift * days) - scenarioShift)),
      range: { lower: round(lower), upper: round(upper) },
      expectedChangePercent: round((base / latest.close - 1) * 100, 2),
      uncertaintyPercent: round((Math.exp(1.28 * sigma) - 1) * 100, 2)
    };
  });
  return {
    status: stale ? "stale_data" : "ok",
    symbol: input.symbol ?? null,
    market: input.market ?? null,
    currency: input.currency ?? null,
    source: input.source ?? null,
    asOfDate,
    latestDataDate: latest.date,
    latestClose: latest.close,
    observations: usable.length,
    dailyVolatilityPercent: round(dailyVolatility * 100, 3),
    estimatedDailyDriftPercent: round(dailyDrift * 100, 4),
    confidence,
    confidenceLabel: confidence >= 75 ? "比較的高い" : confidence >= 50 ? "中程度" : "低い",
    stale,
    decisionAllowed: !stale,
    method: "winsorized_log_return_blend",
    caveats: [
      "過去の価格・変動率から算出した統計的シナリオであり、将来価格を保証しません",
      "強気・弱気は基本シナリオから過去の変動率に応じて幅を持たせた仮定です",
      "決算、金利、為替、ニュース、突発事象はこの価格モデルに直接反映されていません"
    ],
    forecasts
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
