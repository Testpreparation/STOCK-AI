const METRIC_NAMES = [
  "revenue", "operatingIncome", "netIncome", "dilutedEps",
  "totalAssets", "totalLiabilities", "operatingCashFlow", "capitalExpenditures",
  "grossProfit", "cashAndEquivalents", "currentAssets", "currentLiabilities",
  "stockholdersEquity", "longTermDebt"
];

function validDate(value) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

function validFact(fact) {
  return fact && Number.isFinite(Number(fact.value)) &&
    typeof fact.unit === "string" && fact.unit.length > 0 &&
    validDate(fact.fiscalYearEnd);
}

/**
 * Join provider metric arrays into one canonical annual-period structure.
 * Missing facts remain null; values are never estimated or currency-converted.
 */
export function normalizeAnnualFinancials(providerResult, metadata = {}) {
  if (!providerResult || typeof providerResult !== "object" || !providerResult.metrics) {
    throw new TypeError("providerResult.metrics is required");
  }

  const periods = new Map();
  const metricAvailability = {};

  for (const metric of METRIC_NAMES) {
    const entries = Array.isArray(providerResult.metrics[metric]) ? providerResult.metrics[metric] : [];
    const byEnd = new Map();
    for (const fact of entries) {
      if (!validFact(fact)) continue;
      const end = validDate(fact.fiscalYearEnd);
      const previous = byEnd.get(end);
      if (!previous || String(fact.filedAt ?? "") > String(previous.filedAt ?? "")) {
        byEnd.set(end, {
          value: Number(fact.value),
          unit: fact.unit,
          sourceTag: fact.sourceTag ?? null,
          filedAt: fact.filedAt ?? null
        });
      }
    }
    metricAvailability[metric] = byEnd.size;
    for (const [end, fact] of byEnd) {
      if (!periods.has(end)) periods.set(end, { fiscalYearEnd: end, metrics: {} });
      periods.get(end).metrics[metric] = fact;
    }
  }

  const ordered = [...periods.values()]
    .sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd))
    .map(period => {
      for (const metric of METRIC_NAMES) {
        if (!period.metrics[metric]) period.metrics[metric] = null;
      }
      return period;
    });

  return {
    schemaVersion: 1,
    symbol: String(metadata.symbol ?? providerResult.symbol ?? "").trim().toUpperCase() || null,
    market: metadata.market ?? providerResult.market ?? "UNKNOWN",
    currency: metadata.currency ?? providerResult.currency ?? null,
    provider: providerResult.provider ?? metadata.provider ?? "unknown",
    entityName: providerResult.entityName ?? null,
    fetchedAt: providerResult.fetchedAt ?? null,
    periods: ordered,
    metricAvailability,
    dataQuality: {
      periodCount: ordered.length,
      availableMetricCount: Object.values(metricAvailability).filter(count => count > 0).length,
      missingMetrics: METRIC_NAMES.filter(metric => metricAvailability[metric] === 0)
    }
  };
}
