# Stodash roadmap and decisions

## Decisions already made (don't re-ask)

| Decision | Choice | Why / note |
|---|---|---|
| Backend | .NET 10 minimal API | User's choice (originally planned as Python/FastAPI) |
| Frontend | React + TypeScript + Vite | User's choice |
| Theme | Modern dark | User picked it over classic Bloomberg black/orange |
| Data | Free sources only | Personal use; no paid feeds, no public deployment |
| Primary source | Yahoo Finance public endpoints | No key needed; unofficial, so keep fallbacks |
| Secondary source | Finnhub (optional key) | Fallback for quotes and profiles; used for news in phase 2 |
| Workflow | Plan, then one phase at a time, checking in after each | User prefers to review between phases |
| Panels | Max 4; Enter = active panel, Shift+Enter = new | Bloomberg-like "load into current window" |
| FA depth | ~15–20 key rows per statement + an "expand" toggle for all rows | User's choice (phase 2) |
| FA source | Yahoo fundamentals-timeseries first, SEC companyfacts fallback | quoteSummary statement modules are too sparse |
| News | Yahoo always; Finnhub merged in when a key is set | User wants free services only; Finnhub's free plan qualifies |
| SEC contact | `Sec:UserAgent` in user-secrets, never committed | SEC requires a contact email; it's set on the user's machine |

## Free data sources (researched)

| Source | Gives | Key | Free-tier limit (approx., check current terms) |
|---|---|---|---|
| Yahoo Finance (direct HTTP) | Quotes, history, fundamentals, profiles, search, options | No | Unofficial; rate-limits without warning |
| Finnhub | Real-time US quotes, news, profiles, earnings calendar, WebSocket trades | Yes | ~60 calls/min |
| FRED (St. Louis Fed) | 800k+ economic series: CPI, rates, GDP, unemployment, yields | Yes (free) | Generous |
| SEC EDGAR | Filings list, XBRL "company facts" financials | No | Must send a User-Agent with contact info; ~10 req/s |
| US Treasury Fiscal Data | Treasury yields, auctions | No | — |
| CoinGecko | Crypto prices, market caps | Optional demo key | ~30 calls/min |
| Frankfurter | ECB FX reference rates | No | — |
| RSS (Reuters, CNBC, MarketWatch, Yahoo) | Headlines | No | — |
| Alpha Vantage / Twelve Data / FMP / Tiingo / Polygon | Alternates | Yes | Tight free tiers; use only as fallbacks |

## Phases

### Phase 1: Foundation ✅ done
Command bar with autocomplete and history; `DES` (quote, ranges, ~25 key stats, profile, officers); `GP`
(9 ranges, candles/line, SMA 20/50, volume, legend, prev-close line on 1D, exchange-time axis); market strip
(11 instruments); world clocks; status bar with API health; HELP; CLEAR; up to 4 panels saved in localStorage;
Alt+1–4; Enter on a company name opens the best match. Verified in a browser.

### Phase 2: Core research ✅ done
Built as planned below, with Yahoo fundamentals-timeseries (not quoteSummary) as FA's main source. Extras: the `FA Q`
shortcut, a YoY/QoQ Change column, ratios (margins, growth, ROE/ROA, D/E, current ratio), filing categories with
counts, and 8-K item descriptions. Verified in a browser.
- `FA`: financial statements (income, balance sheet, cash flow; annual and quarterly toggle) plus key ratios.
  Source: Yahoo `quoteSummary` modules `incomeStatementHistory`, `balanceSheetHistory`, `cashflowStatementHistory`
  (and `*Quarterly`), or the Yahoo fundamentals-timeseries endpoint. Fallback: SEC EDGAR `companyfacts` for US
  companies (needs ticker→CIK mapping from `https://www.sec.gov/files/company_tickers.json`, cached daily).
- `N`: company news. Source: Finnhub `company-news` (needs a key), with Yahoo search's `news` array as the keyless fallback.
  Show headline, source, time ago, and a link that opens in a new tab.
- `CF`: SEC filings list (10-K, 10-Q, 8-K, …) with form-type filter chips and links to EDGAR. Source:
  `https://data.sec.gov/submissions/CIK##########.json`. A User-Agent header with contact info is required; make it
  configurable in appsettings (`Sec:UserAgent`) instead of hard-coding the user's email.
- Add a simple provider-health line to `/api/health`.

### Phase 3: Live and macro (next)
- `W`: watchlist (persisted on the backend in SQLite, or localStorage first) with live quotes through Finnhub WebSocket,
  relayed by a backend WebSocket `/ws/quotes` so the key stays server-side.
- `ECO`: macro dashboard from FRED (CPI YoY, core PCE, unemployment, fed funds, GDP growth, 10Y-2Y).
- `YC`: US Treasury yield curve (today against 1 month and 1 year ago).
- `FX`: major pairs grid (Frankfurter + Yahoo `=X`). `CRYPTO`: top coins (CoinGecko).
- Move the cache to SQLite so it survives restarts.

### Phase 4: Power features
- `TOP`: top market headlines (RSS + Finnhub general news).
- `EQS`: screener over a preset universe (S&P 500 list, refreshed daily) with filters (P/E, market cap, sector, % change).
- Saved layouts (named workspaces), more keyboard shortcuts, resizable panels.

### Phase 5: Polish
Error and empty states, loading skeletons everywhere, theme tweaks, accessibility pass, README and screenshots,
and optionally backend unit tests (xUnit) for the mappers and the command parser.

## Out of scope
Trading or order execution, paid real-time data, user accounts, public hosting, and deep bond or options analytics.
