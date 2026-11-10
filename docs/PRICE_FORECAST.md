# Price Forecast Engine

## Purpose

A transparent, deterministic statistical projection from historical adjusted closing prices. It is not an AI/ML model and does not guarantee future prices.

## Input

Pass normalized price data from `normalizePriceRows`:

- `data`: ascending daily rows with ISO `date` and positive adjusted `close`.
- Optional metadata: `symbol`, `market`, `currency`, `source`.
- Options: `asOfDate`, `minObservations` (default 60), `maxDataAgeDays` (default 10), `isStale`.

## Method

1. Calculate daily log returns.
2. Winsorize returns at the 5th/95th percentiles to reduce the influence of isolated outliers.
3. Blend 20-session, 60-session and full-history mean returns (45% / 35% / 20%).
4. Cap estimated daily drift at +/-0.15% to avoid extrapolating extreme trends.
5. Estimate volatility from the historical return sample.
6. Produce bull/base/bear scenario centers and a 80%-approximately normal-model uncertainty interval for 20, 63 and 252 trading sessions.

## Safety and interpretation

- Dates must be strictly ascending; invalid/duplicate/out-of-order data is rejected.
- At least 60 valid observations are required by default.
- Data older than 10 calendar days relative to `asOfDate` is marked stale; stale results cannot be used for a buy decision.
- Confidence is a heuristic indicator based on history length, volatility and volatility stability, not a statistically calibrated probability.
- Forecasts do not directly incorporate earnings, interest rates, FX, news or sudden events.
- The model never places orders. It is a research aid, not investment advice.

## Run tests

`npm run test:engine`
