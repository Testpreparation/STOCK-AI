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
- Daily raw OHLCV is not split/dividend adjusted. The manifest marks it `RAW_UNADJUSTED`; do not use it as the sole basis for purchase decisions or long-range technical backtests.
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

The workflow runs on weekdays at 07:30 JST (22:30 UTC previous day) and can also be started manually. It commits validated snapshots under `public-data/` for GitHub Pages to serve. Public repository data is public; never put personal holdings, account details, or API keys in the universe file or generated snapshots.

## Safety
- Existing snapshots are retained when an individual fetch fails; the manifest records the warning.
- Invalid datasets are not saved.
- API secrets are only passed to the GitHub Actions runtime.
- Alpha Vantage raw unadjusted prices and J-Quants delayed prices are clearly labeled.
- This workflow does not execute trades.
