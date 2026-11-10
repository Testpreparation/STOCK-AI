# Data Provider Policy

## Japan equities: J-Quants API V2

- Endpoint: `GET https://api.jquants.com/v2/equities/bars/daily`
- Authentication: API key in the `x-api-key` request header.
- Free plan: ¥0, but daily prices are delayed by 12 weeks and the accessible history is limited. The free-plan request limit is 5 requests per minute.
- The adapter runs only in Node.js automation. Never place the API key in HTML, browser JavaScript, or committed files.
- Configure the key as a GitHub Actions repository secret named `JQUANTS_API_KEY`.
- Do not use free-plan J-Quants prices to make current buy/sell timing decisions. The application must label the data as delayed and block purchase eligibility when the delay makes it stale.
- Respect J-Quants terms and individual-use restrictions. Do not republish raw provider data as a public dataset.

Official references:
- https://jpx-jquants.com/ja/spec/quickstart
- https://jpx-jquants.com/ja/help/about
- https://jpx-jquants.com/ja/help/plan

## United States fundamentals: SEC EDGAR (next provider)

SEC company facts and submissions APIs are public and do not require API keys. Automated requests must comply with SEC fair-access guidance and include an identifying User-Agent. SEC EDGAR does not provide daily market prices; it is a fundamentals/filings source only.

Official reference:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces

## Provider activation policy

A provider is not production-ready until its endpoint, authentication, rate limits, delay, coverage, licensing/terms, and failure behavior are documented and tested. Unofficial endpoints may be used only as explicitly labeled experimental fallbacks, never as the sole source for purchase decisions.
