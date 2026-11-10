# STOCK AI JavaScript Engine Architecture

## Non-negotiable constraints
- No Python runtime or Python source files.
- No paid AI, paid market-data API, or paid server dependency.
- Static HTML/CSS/JavaScript frontend.
- Scheduled processing runs on Node.js through GitHub Actions.
- Firebase Spark is optional for user-owned settings and portfolio records.
- No automated order execution.

## Data flow
1. Provider adapters retrieve source data.
2. Normalizers convert provider payloads to canonical OHLCV.
3. Validators reject malformed rows and assess freshness.
4. Analysis modules consume validated data only.
5. Purchase-decision gates block stale or incomplete data.
6. Forecasts are stored with source snapshot and model version.
7. Evaluators compare matured forecasts with actual outcomes.
8. Candidate models are tested out-of-sample before promotion.

## Canonical price dataset
schemaVersion, symbol, market, currency, source, fetchedAt, and data[] containing date/open/high/low/close/volume.
Dates use ISO calendar format. Prices and volume must be finite numbers. High/low bounds and duplicate dates are checked.

## Initial implementation
- Provider-neutral price normalization.
- OHLCV validation, duplicate detection, chronological ordering, date-gap warnings, freshness classification.
- SMA, EMA, and Wilder RSI.
- Node built-in test runner; no third-party runtime dependency.

## Limitations
These indicators are building blocks, not a validated trading strategy. Freshness uses calendar days, not exchange calendars. A provider adapter must document licensing, rate limits, delay, and coverage before activation.
