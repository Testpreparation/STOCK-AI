import { validatePriceDataset } from "./data/validator.js";
import { calculateTechnicalIndicators } from "./analysis/technical.js";
import { analyzeFinancials } from "./analysis/financial.js";
import { calculateStockScore } from "./analysis/scoring.js";
import { forecastPrices } from "./analysis/forecast.js";

/**
 * End-to-end instrument analysis.
 * The caller supplies normalized price data and, optionally, normalized annual
 * financial data. Provider credentials and network access stay outside this module.
 */
export function analyzeInstrument({ priceDataset, financialData = null, valuation = null, businessQuality = null, marketEnvironment = null, risk = {}, asOf, maxPriceAgeDays = 5, maxForecastAgeDays = 10 } = {}) {
  if (!priceDataset || !Array.isArray(priceDataset.data)) {
    throw new TypeError("priceDataset.data is required");
  }
  const validation = validatePriceDataset(priceDataset, { asOf, maxAgeDays: maxPriceAgeDays });
  const acceptedRows = validation.accepted;
  const cleanDataset = { ...priceDataset, data: acceptedRows };
  const technicalIndicators = acceptedRows.length
    ? calculateTechnicalIndicators(acceptedRows)
    : { sma20: [], sma50: [], ema12: [], ema26: [], rsi14: [] };
  const financial = financialData ? analyzeFinancials(financialData) : null;
  const forecast = priceDataset.priceAdjustment === "RAW_UNADJUSTED"
    ? { status: "unsupported_adjustment", reason: "未調整価格のため、分割・配当の影響を排除した予測は行いません", forecasts: [] }
    : acceptedRows.length
    ? forecastPrices(cleanDataset, {
        asOfDate: asOf ? String(asOf).slice(0, 10) : undefined,
        maxDataAgeDays: maxForecastAgeDays,
        isStale: validation.quality.freshness === "STALE"
      })
    : { status: "insufficient_data", reason: "有効な株価データがありません", forecasts: [] };

  const score = calculateStockScore({
    symbol: priceDataset.symbol,
    market: priceDataset.market,
    financial,
    valuation,
    technical: {
      closes: acceptedRows.map(row => row.close),
      sma20: technicalIndicators.sma20,
      sma50: technicalIndicators.sma50,
      rsi14: technicalIndicators.rsi14
    },
    businessQuality,
    marketEnvironment,
    risk,
    dataFreshness: {
      isStale: !validation.safeForPurchaseDecision,
      isValid: validation.valid,
      priceAdjustment: priceDataset.priceAdjustment ?? null
    }
  });

  return {
    schemaVersion: 1,
    symbol: priceDataset.symbol ?? null,
    market: priceDataset.market ?? "UNKNOWN",
    currency: priceDataset.currency ?? null,
    provider: priceDataset.source ?? "unknown",
    analyzedAt: new Date().toISOString(),
    dataQuality: {
      valid: validation.valid,
      usableForAnalysis: validation.usableForAnalysis,
      safeForPurchaseDecision: validation.safeForPurchaseDecision,
      ...validation.quality,
      warnings: validation.warnings,
      errors: validation.errors
    },
    technical: {
      indicators: technicalIndicators,
      latest: {
        close: acceptedRows.at(-1)?.close ?? null,
        date: acceptedRows.at(-1)?.date ?? null,
        sma20: technicalIndicators.sma20.at(-1) ?? null,
        sma50: technicalIndicators.sma50.at(-1) ?? null,
        rsi14: technicalIndicators.rsi14.at(-1) ?? null
      }
    },
    financial,
    score,
    forecast,
    limitations: [
      "データ提供元からの取得処理は呼び出し側で行い、APIキーをブラウザーへ渡さないでください。",
      "欠損した財務・バリュエーション・事業品質・市場環境データは推測で補完しません。",
      "買い判定には鮮度・品質条件を満たす株価データが必要です。",
      "この分析は情報整理の補助であり、自動売買や利益保証を行いません。"
    ]
  };
}

export function getEngineCapabilities() {
  return {
    priceNormalization: true,
    priceValidation: true,
    technicalIndicators: true,
    annualFinancialAnalysis: true,
    weightedStockScoring: true,
    scenarioForecasting: true,
    forecastEvaluation: true,
    forecastHistoryTracking: true,
    forecastErrorCalibration: true,
    providerAdapters: true,
    scheduledDataIngestion: true,
    liveProviderConnection: false,
    browserApiCredentials: false,
    automaticTrading: false
  };
}
