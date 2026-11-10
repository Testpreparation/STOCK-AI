# Shared Financial Analysis Engine

## Modules

- `engine/data/financial-normalizer.js`: joins provider metric arrays into a canonical annual-period schema.
- `engine/analysis/financial.js`: computes comparable year-over-year growth, trends, operating margin, liabilities-to-assets, and transparent data-quality signals.

## Canonical metric names

`revenue`, `operatingIncome`, `netIncome`, `dilutedEps`, `totalAssets`, `totalLiabilities`, and `operatingCashFlow`.

Each fact retains its reported value, unit, source tag, and filing date. Values are not currency-converted or guessed. Missing values remain `null`.

## Guardrails

- Growth is not calculated against a zero baseline.
- Negative-to-nonnegative changes are labeled as turnarounds, not infinite percentage growth.
- Negative-to-negative changes are labeled separately rather than presented as ordinary growth.
- Growth is suppressed if units differ between periods.
- Thin or incomplete coverage is explicitly marked and cannot be treated as a standalone buy signal.
- Liabilities-to-assets is labeled accurately; it is not mislabeled as debt-to-equity.
- The engine uses annual periods and does not yet normalize all issuer-specific XBRL tags or fiscal-year restatements.

## Run tests

`npm run test:engine`
