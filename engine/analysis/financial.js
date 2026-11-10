const METRICS = [
  "revenue", "operatingIncome", "netIncome", "dilutedEps",
  "totalAssets", "totalLiabilities", "operatingCashFlow", "capitalExpenditures",
  "grossProfit", "cashAndEquivalents", "currentAssets", "currentLiabilities",
  "stockholdersEquity", "longTermDebt"
];

const numeric = value => Number.isFinite(value) ? value : null;

function metricValue(period, name) {
  const item = period?.metrics?.[name];
  return item && Number.isFinite(item.value) ? item.value : null;
}

function growth(current, previous) {
  if (current === null || previous === null) return { value: null, status: "missing" };
  if (previous === 0) return { value: null, status: "zero-baseline" };
  if (previous < 0 && current >= 0) return { value: null, status: "turnaround" };
  if (previous < 0 && current < 0) return { value: null, status: "loss-narrowing-or-widening" };
  if (current < 0 && previous > 0) return { value: null, status: "turned-negative" };
  return { value: ((current / previous) - 1) * 100, status: "calculated" };
}

function trend(periods, name) {
  const values = periods
    .map(period => ({ date: period.fiscalYearEnd, value: metricValue(period, name) }))
    .filter(item => item.value !== null);
  if (values.length < 2) return { direction: "insufficient-data", observations: values.length };
  const first = values[0].value;
  const last = values.at(-1).value;
  const direction = last > first ? "improving" : last < first ? "deteriorating" : "flat";
  return { direction, first, last, observations: values.length, from: values[0].date, to: values.at(-1).date };
}

function latestGrowth(periods, name) {
  const usable = periods.filter(period => metricValue(period, name) !== null);
  if (usable.length < 2) return { value: null, status: "insufficient-data" };
  const current = usable.at(-1);
  const previous = usable.at(-2);
  const result = growth(metricValue(current, name), metricValue(previous, name));
  return { ...result, currentPeriod: current.fiscalYearEnd, previousPeriod: previous.fiscalYearEnd };
}

function sameUnit(periods, name) {
  const units = new Set(periods.map(period => period.metrics?.[name]?.unit).filter(Boolean));
  return units.size <= 1;
}

/**
 * Analyze canonical annual financials. Growth percentages are suppressed for
 * zero/negative baselines and for mixed units rather than presenting misleading numbers.
 */
export function analyzeFinancials(financialData) {
  if (!financialData || !Array.isArray(financialData.periods)) {
    throw new TypeError("financialData.periods must be an array");
  }
  const periods = [...financialData.periods]
    .filter(period => /^\d{4}-\d{2}-\d{2}$/.test(period.fiscalYearEnd ?? ""))
    .sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));

  const latest = periods.at(-1) ?? null;
  const previous = periods.at(-2) ?? null;
  const metrics = {};

  for (const name of METRICS) {
    const unitConsistent = sameUnit(periods, name);
    metrics[name] = {
      latest: latest ? metricValue(latest, name) : null,
      previous: previous ? metricValue(previous, name) : null,
      unit: latest?.metrics?.[name]?.unit ?? null,
      trend: trend(periods, name),
      ...( ["revenue", "operatingIncome", "netIncome", "dilutedEps"].includes(name)
        ? { yearOverYearGrowth: unitConsistent ? latestGrowth(periods, name) : { value: null, status: "mixed-units" } }
        : {})
    };
  }

  const revenue = metrics.revenue.latest;
  const operatingIncome = metrics.operatingIncome.latest;
  const assets = metrics.totalAssets.latest;
  const liabilities = metrics.totalLiabilities.latest;
  const operatingCashFlow = metrics.operatingCashFlow.latest;
  const capitalExpenditures = metrics.capitalExpenditures.latest;
  const currentAssets = metrics.currentAssets.latest;
  const currentLiabilities = metrics.currentLiabilities.latest;
  const equity = metrics.stockholdersEquity.latest;
  const longTermDebt = metrics.longTermDebt.latest;
  const grossProfit = metrics.grossProfit.latest;

  const operatingMargin = revenue !== null && revenue > 0 && operatingIncome !== null
    ? (operatingIncome / revenue) * 100 : null;
  const liabilitiesToAssets = assets !== null && assets > 0 && liabilities !== null
    ? (liabilities / assets) * 100 : null;
  const grossMargin = revenue !== null && revenue > 0 && grossProfit !== null
    ? (grossProfit / revenue) * 100 : null;
  const freeCashFlow = operatingCashFlow !== null && capitalExpenditures !== null
    ? operatingCashFlow - Math.abs(capitalExpenditures) : null;
  const currentRatio = currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0
    ? currentAssets / currentLiabilities : null;
  const equityRatio = assets !== null && assets > 0 && equity !== null
    ? (equity / assets) * 100 : null;
  const debtToEquity = equity !== null && equity > 0 && longTermDebt !== null
    ? longTermDebt / equity : null;

  const availableCount = METRICS.filter(name => metrics[name].latest !== null).length;
  const quality = availableCount >= 5 && periods.length >= 2 ? "good"
    : availableCount >= 3 && periods.length >= 1 ? "limited" : "insufficient";

  const signals = [];
  if (operatingMargin !== null) {
    signals.push({ name: "operating-margin", status: operatingMargin > 15 ? "strong" : operatingMargin > 5 ? "moderate" : operatingMargin >= 0 ? "weak" : "negative", value: operatingMargin });
  }
  if (liabilitiesToAssets !== null) {
    signals.push({ name: "liabilities-to-assets", status: liabilitiesToAssets < 40 ? "lower" : liabilitiesToAssets < 70 ? "moderate" : "high", value: liabilitiesToAssets });
  }
  if (operatingCashFlow !== null) {
    signals.push({ name: "operating-cash-flow", status: operatingCashFlow > 0 ? "positive" : operatingCashFlow < 0 ? "negative" : "zero", value: operatingCashFlow });
  }
  if (freeCashFlow !== null) signals.push({ name: "free-cash-flow", status: freeCashFlow > 0 ? "positive" : freeCashFlow < 0 ? "negative" : "zero", value: freeCashFlow });
  if (currentRatio !== null) signals.push({ name: "current-ratio", status: currentRatio >= 1.5 ? "strong" : currentRatio >= 1 ? "adequate" : "weak", value: currentRatio });
  if (grossMargin !== null) signals.push({ name: "gross-margin", status: grossMargin >= 40 ? "strong" : grossMargin >= 20 ? "moderate" : "weak", value: grossMargin });
  for (const name of ["revenue", "operatingIncome", "netIncome", "dilutedEps"]) {
    const result = metrics[name].yearOverYearGrowth;
    if (result?.status === "turnaround") signals.push({ name, status: "turnaround", detail: "Prior period was negative and current period is non-negative." });
    else if (result?.status === "turned-negative") signals.push({ name, status: "turned-negative" });
    else if (result?.status === "loss-narrowing-or-widening") signals.push({ name, status: "negative-both-periods" });
  }

  return {
    schemaVersion: 1,
    symbol: financialData.symbol ?? null,
    market: financialData.market ?? "UNKNOWN",
    currency: financialData.currency ?? null,
    provider: financialData.provider ?? "unknown",
    analyzedAt: new Date().toISOString(),
    latestPeriod: latest?.fiscalYearEnd ?? null,
    previousPeriod: previous?.fiscalYearEnd ?? null,
    metrics,
    derived: {
      operatingMarginPercent: numeric(operatingMargin),
      liabilitiesToAssetsPercent: numeric(liabilitiesToAssets),
      grossMarginPercent: numeric(grossMargin),
      freeCashFlow: numeric(freeCashFlow),
      currentRatio: numeric(currentRatio),
      equityRatioPercent: numeric(equityRatio),
      debtToEquity: numeric(debtToEquity)
    },
    signals,
    dataQuality: {
      status: quality,
      periodCount: periods.length,
      availableLatestMetricCount: availableCount,
      missingLatestMetrics: METRICS.filter(name => metrics[name].latest === null),
      warnings: [
        ...(periods.length < 2 ? ["At least two annual periods are needed for year-over-year comparisons."] : []),
        ...(quality !== "good" ? ["Financial coverage is incomplete; do not treat this analysis as a standalone buy signal."] : []),
        "Values are not currency-converted; compare only compatible units and reporting bases."
      ]
    }
  };
}
