# Data Provider Policy

## Japan equities: J-Quants API V2

- Endpoint: `GET https://api.jquants.com/v2/equities/bars/daily`
- Authentication: API key in the `x-api-key` request header.
- Free plan: daily prices are delayed by 12 weeks and accessible history/request limits apply.
- Run the adapter only in Node.js automation. Never place the API key in HTML, browser JavaScript, or committed files.
- Configure the key as a GitHub Actions repository secret named `JQUANTS_API_KEY`.
- Do not use delayed free-plan prices for current buy/sell timing decisions.
- Respect J-Quants terms and individual-use restrictions.

Official references:
- https://jpx-jquants.com/ja/spec/quickstart
- https://jpx-jquants.com/ja/help/about
- https://jpx-jquants.com/ja/help/plan

## US equities: SEC EDGAR Company Facts

- Endpoint: `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`
- Authentication: no API key; send an identifying `User-Agent` with contact information.
- The adapter extracts annual 10-K facts where available: revenue, operating income, net income, diluted EPS, assets, liabilities, and operating cash flow.
- SEC facts are reported XBRL facts, not a complete standardized statement. Issuers may use different tags/units; missing facts remain missing.
- SEC data is historical filing data, not a real-time quote feed.
- Respect SEC fair-access guidance. Keep request volume conservative, cache responses, and never issue concurrent request bursts.

Official references:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.sec.gov/os/accessing-edgar-data

## Provider activation policy

A provider is not production-ready until its endpoint, authentication, rate limits, delay, coverage, licensing/terms, and failure behavior are documented and tested. Unofficial endpoints may be used only as explicitly labeled experimental fallbacks, never as the sole source for purchase decisions.
