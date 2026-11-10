# Daily Market Data Automation

## Providers and limitations

### Japan — J-Quants API V2 Free
- Uses daily OHLCV with adjusted fields when provided by the API.
- Free plan delivers data with a 12-week delay and provides approximately two years of history.
- The scheduled job requests the accessible historical window ending 12 weeks before the run date.
- This dataset is historical research material, not current buy-timing data.

### United States — Alpha Vantage Free
- Uses `TIME_SERIES_DAILY` with `outputsize=compact` (latest 100 daily observations).
- Free API key is required; provider states 25 requests/day for the standard free service.
- Daily raw OHLCV is not split/dividend adjusted. The manifest marks it `RAW_UNADJUSTED`; the integrated pipeline blocks buy-oriented recommendations and scenario forecasts for this source until adjusted history is available.
- The scheduled workflow spaces requests to stay conservative. Keep the US universe small and within provider limits.

### US fundamentals — SEC EDGAR
- Company Facts is fetched for configured CIKs using `SEC_USER_AGENT`.
- Supply a descriptive User-Agent including contact information; do not commit it.
- The resulting facts are stored separately from price data.

## Configuration

Edit `config/market-universe.json` to change the small starter universe. Japan symbols are 4/5 digit J-Quants codes; US symbols are Alpha Vantage tickers. Map US tickers to SEC CIKs in `secCikBySymbol`.

## GitHub Actions secrets

In repository Settings → Secrets and variables → Actions, add:
- `JQUANTS_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `SEC_USER_AGENT` (example format: `STOCK-AI research contact@example.com`; use your own contact address)

The workflow runs on weekdays at 17:40 JST (08:40 UTC) and can also be started manually. This is a once-per-business-day refresh, not a streaming quote feed. The time is chosen to run after the Japanese market close and after the prior US session close; GitHub Actions scheduled starts can be delayed. It commits validated snapshots under `public-data/` for GitHub Pages to serve. While the dashboard tab is open, the browser checks the public manifest every five minutes and on returning to the foreground. If a new snapshot has been published, it reloads the data and recalculates the displayed analysis. This browser polling does not call provider APIs and does not make the underlying prices more current than the provider's latest available data. Public repository data is public; never put personal holdings, account details, or API keys in the universe file or generated snapshots.

## Safety
- Existing snapshots are retained when an individual fetch fails; the manifest records the warning.
- Invalid datasets are not saved.
- API secrets are only passed to the GitHub Actions runtime.
- Alpha Vantage raw unadjusted prices and J-Quants delayed prices are clearly labeled.
- This workflow does not execute trades.

## Free refresh behavior

- J-Quants Free remains 12 weeks delayed; querying it more often does not remove that delay. The scheduled job collects the newest record available under the Free plan.
- Alpha Vantage's free daily endpoint is updated at end of day. The dashboard refreshes when the next published snapshot appears; it does not provide free intraday quotes.
- The dashboard checks for a new manifest every five minutes only while the page is visible, and also checks when the user returns to the tab.
- A fresh browser check is not the same as a fresh market quote. Always inspect each instrument's `latestDate`, provider and adjustment status before relying on analysis.
