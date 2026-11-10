# Stock Scoring Engine

## 100-point allocation

| Component | Weight |
|---|---:|
| Growth | 30 |
| Financial health | 20 |
| Valuation | 15 |
| Technical | 15 |
| Business quality | 10 |
| Market environment | 10 |

## Inputs

- `financial`: output of `analyzeFinancials`.
- `valuation`: positive PE/PB and comparable sector median PE/PB.
- `technical`: aligned close, SMA20, SMA50 and RSI14 arrays.
- `businessQuality`: evidence-backed 0–100 scores for competitive position, management quality, recurring revenue, and governance.
- `marketEnvironment`: benchmark trend score, market breadth percentage, and volatility percentage.
- `dataFreshness` and `risk`: explicit safety flags.

## Rules

- Each component is scored only when its input data exists and is valid.
- The overall score is the weighted average of available components; coverage reports how much of the 100-point model is actually represented.
- Coverage below 80% yields `判定保留`; a buy-oriented label is not allowed.
- Stale/invalid data, insufficient financial quality, critical risk alerts, or unresolved important events block buy-oriented labels.
- Missing values are not filled with neutral or guessed scores.
- Business-quality and market inputs must be sourced by upstream modules; this scoring module does not manufacture them.
- This is a screening aid, not a return guarantee or automatic trading instruction.

## Run tests

`npm run test:engine`
