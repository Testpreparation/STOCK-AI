const WEIGHTS = {
  growth: 30,
  financialHealth: 20,
  valuation: 15,
  technical: 15,
  businessQuality: 10,
  marketEnvironment: 10
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const finite = value => Number.isFinite(value);
const linearScore = (value, low, high) => finite(value) ? clamp(((value - low) / (high - low)) * 100) : null;

function latestMetric(financial, name) {
  const value = financial?.metrics?.[name]?.latest;
  return finite(value) ? value : null;
}

function growthValue(financial, name) {
  const item = financial?.metrics?.[name]?.yearOverYearGrowth;
  return item?.status === "calculated" && finite(item.value) ? item.value : null;
}

function scoreGrowth(financial) {
  const values = ["revenue", "operatingIncome", "netIncome", "dilutedEps"]
    .map(name => growthValue(financial, name))
    .filter(finite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + linearScore(value, -20, 20), 0) / values.length;
}

function scoreFinancialHealth(financial) {
  const parts = [];
  const margin = financial?.derived?.operatingMarginPercent;
  const liabilities = financial?.derived?.liabilitiesToAssetsPercent;
  const cashFlow = latestMetric(financial, "operatingCashFlow");
  const netIncome = latestMetric(financial, "netIncome");

  if (finite(margin)) parts.push(linearScore(margin, -5, 20));
  if (finite(liabilities)) parts.push(linearScore(100 - liabilities, 20, 80));
  if (finite(cashFlow)) parts.push(cashFlow > 0 ? 100 : cashFlow < 0 ? 0 : 40);
  if (finite(cashFlow) && finite(netIncome) && netIncome > 0) {
    parts.push(cashFlow > netIncome * 0.8 ? 100 : cashFlow > 0 ? 60 : 0);
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function scoreValuation(valuation) {
  if (!valuation || typeof valuation !== "object") return null;
  const parts = [];
  if (finite(valuation.pe) && finite(valuation.sectorMedianPe) && valuation.pe > 0 && valuation.sectorMedianPe > 0) {
    parts.push(linearScore((valuation.sectorMedianPe / valuation.pe) * 100, 50, 150));
  }
  if (finite(valuation.pb) && finite(valuation.sectorMedianPb) && valuation.pb > 0 && valuation.sectorMedianPb > 0) {
    parts.push(linearScore((valuation.sectorMedianPb / valuation.pb) * 100, 50, 150));
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function scoreTechnical(technical) {
  if (!technical || !Array.isArray(technical.closes) || !technical.closes.length) return null;
  const close = technical.closes.at(-1);
  if (!finite(close) || close <= 0) return null;
  const parts = [];
  const sma20 = technical.sma20?.at(-1);
  const sma50 = technical.sma50?.at(-1);
  const rsi = technical.rsi14?.at(-1);
  if (finite(sma20)) parts.push(close > sma20 ? 100 : 0);
  if (finite(sma50)) parts.push(close > sma50 ? 100 : 0);
  if (finite(rsi)) {
    // Neutral RSI scores best; extreme overbought/oversold readings are risk signals.
    parts.push(rsi >= 45 && rsi <= 65 ? 100 : rsi >= 35 && rsi < 45 || rsi > 65 && rsi <= 75 ? 60 : 20);
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function scoreBusinessQuality(quality) {
  const values = ["competitivePosition", "managementQuality", "recurringRevenue", "governance"]
    .map(key => quality?.[key])
    .filter(value => finite(value) && value >= 0 && value <= 100);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function scoreMarketEnvironment(market) {
  if (!market || typeof market !== "object") return null;
  const values = [];
  if (finite(market.benchmarkTrendScore) && market.benchmarkTrendScore >= 0 && market.benchmarkTrendScore <= 100) values.push(market.benchmarkTrendScore);
  if (finite(market.marketBreadthPercent)) values.push(linearScore(market.marketBreadthPercent, 20, 80));
  if (finite(market.volatilityPercent)) values.push(linearScore(40 - market.volatilityPercent, 0, 35));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function recommendation(score, coverage, guards) {
  if (coverage < 80) return { label: "判定保留", code: "INSUFFICIENT_COVERAGE", reason: "評価データの充足率が80%未満です。" };
  if (guards.length) return { label: "買い判定停止", code: "RISK_GUARD", reason: guards.join(" ") };
  if (score >= 90) return { label: "非常に有望", code: "VERY_PROMISING" };
  if (score >= 80) return { label: "購入検討", code: "CONSIDER_BUY" };
  if (score >= 70) return { label: "監視・押し目待ち", code: "WATCH_FOR_DIP" };
  if (score >= 50) return { label: "様子見", code: "WAIT" };
  return { label: "推奨しない", code: "NOT_RECOMMENDED" };
}

/**
 * Weighted 100-point stock score. Missing components are excluded from the
 * weighted average but reduce coverage. Buy-oriented labels are blocked below
 * 80% coverage and by explicit data/risk guardrails.
 */
export function calculateStockScore(input = {}) {
  const components = {
    growth: scoreGrowth(input.financial),
    financialHealth: scoreFinancialHealth(input.financial),
    valuation: scoreValuation(input.valuation),
    technical: scoreTechnical(input.technical),
    businessQuality: scoreBusinessQuality(input.businessQuality),
    marketEnvironment: scoreMarketEnvironment(input.marketEnvironment)
  };

  let availableWeight = 0;
  let weightedTotal = 0;
  const breakdown = {};
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    const score = components[name];
    const available = finite(score);
    if (available) {
      availableWeight += weight;
      weightedTotal += score * weight;
    }
    breakdown[name] = {
      weight,
      score: available ? Math.round(score * 10) / 10 : null,
      weightedPoints: available ? Math.round(score * weight) / 100 : null,
      status: available ? "scored" : "missing"
    };
  }

  const coveragePercent = availableWeight;
  const score = availableWeight ? Math.round((weightedTotal / availableWeight) * 10) / 10 : null;
  const guards = [];
  if (input.dataFreshness?.isStale === true) guards.push("株価または主要データが古いため、買い判定を停止しています。");
  if (input.dataFreshness?.isValid === false) guards.push("データ検証に失敗しています。");
  if (input.financial?.dataQuality?.status === "insufficient") guards.push("財務データの品質が不足しています。");
  if (input.risk?.criticalAlert === true) guards.push("重大なリスク警告があります。");
  if (input.risk?.unresolvedEvent === true) guards.push("未評価の重要イベントがあります。");

  return {
    schemaVersion: 1,
    symbol: input.symbol ?? input.financial?.symbol ?? null,
    market: input.market ?? input.financial?.market ?? "UNKNOWN",
    calculatedAt: new Date().toISOString(),
    score,
    scale: 100,
    coveragePercent,
    confidence: coveragePercent >= 90 ? "high" : coveragePercent >= 80 ? "moderate" : coveragePercent >= 60 ? "low" : "insufficient",
    components: breakdown,
    recommendation: recommendation(score ?? 0, coveragePercent, guards),
    guardrails: guards,
    limitations: [
      "A score is a screening aid, not a guaranteed return or a personalized order instruction.",
      "Missing components reduce coverage; scores with low coverage are not eligible for buy-oriented labels.",
      "Valuation comparisons require a valid sector median and comparable accounting basis.",
      "Business-quality inputs must be independently sourced and evidence-backed; the engine does not invent them."
    ]
  };
}

export const STOCK_SCORE_WEIGHTS = Object.freeze({ ...WEIGHTS });
