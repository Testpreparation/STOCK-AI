# Integrated Analysis Pipeline

## Entry point

Import `analyzeInstrument` from `engine/pipeline.js`.

```js
import { analyzeInstrument } from "./engine/pipeline.js";

const result = analyzeInstrument({
  priceDataset,       // normalizePriceRows(...) output
  financialData,      // normalizeAnnualFinancials(...) output, optional
  valuation,          // only comparable, source-backed PE/PB data
  businessQuality,    // evidence-backed 0–100 fields
  marketEnvironment,  // benchmark/breadth/volatility inputs
  risk,               // explicit criticalAlert/unresolvedEvent flags
  asOf: "2026-11-10T00:00:00Z"
});
```

## Pipeline

1. Validate normalized OHLCV rows and assess freshness.
2. Exclude invalid rows from downstream calculations while retaining rejection/warning metadata.
3. Calculate SMA20, SMA50, EMA12, EMA26 and RSI14.
4. Analyze annual financial periods when supplied.
5. Calculate the weighted 100-point score with missing-data coverage and purchase guardrails.
6. Generate short-, medium- and long-horizon scenario forecasts.
7. Return one structured result with source, quality, technicals, financials, score and forecast.

## Security boundary

Provider adapters are deliberately not called by the browser pipeline. J-Quants API keys and SEC identifying User-Agent configuration must remain in a trusted automation/server environment. Never put secrets in `index.html`, browser JavaScript, public JSON or Git commits.

The current static dashboard can load the pure JavaScript engine, but it does not yet fetch live market data. Provider credentials, daily scheduling, durable forecast history and real-data validation are a separate integration stage. `getEngineCapabilities()` reports that live provider connection is not yet enabled.

## Missing data and decisions

Missing financial, valuation, business-quality and market inputs remain missing. They are never guessed. Stale or invalid price data blocks purchase-decision eligibility. The pipeline never places trades.

## Tests

Run `npm run test:engine` with Node.js 20 or newer.
